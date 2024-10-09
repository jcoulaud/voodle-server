import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import BigNumber from 'bignumber.js';
import { API_MAX_RETRIES, SWAP_GAS_AMOUNT, TON_API_URL } from '../../constants';
import {
  AccountEvent,
  AccountTransaction,
  Token,
  TokenMetadata,
  TonApiAccount,
  Trade,
  Transaction,
  TransactionCheckResult,
  TransactionType,
} from '../../types';

@Injectable()
export class TonApiService {
  private api!: AxiosInstance;
  private logger = new Logger(TonApiService.name);

  constructor(
    @Inject(HttpService) private readonly httpService: HttpService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    this.initializeAxios();
  }

  private initializeAxios() {
    if (!this.httpService) {
      throw new Error('HttpService is not initialized in TonApiService.');
    }
    this.api = this.httpService.axiosRef;
    if (!this.api) {
      throw new Error('Failed to get axiosRef from HttpService.');
    }

    this.api.defaults.baseURL = TON_API_URL;

    const apiKey = this.configService.get<string>('TON_API_KEY');

    if (!apiKey) {
      throw new Error('TON_API_KEY is not set in the configuration.');
    }
    this.api.defaults.headers.common['Authorization'] = `Bearer ${apiKey}`;

    axiosRetry(this.api, {
      retries: API_MAX_RETRIES,
      retryDelay: axiosRetry.exponentialDelay,
    });
  }

  async getAccount(address: string): Promise<TonApiAccount | null> {
    try {
      const response = await this.api.get(`/v2/accounts/${address}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching account for ${address}`, error);
      return null;
    }
  }

  async fetchTokenMetadata(address: string): Promise<TokenMetadata | null> {
    try {
      const { data } = await this.api.get(`/v2/jettons/${address}`);
      return data;
    } catch (error) {
      return null;
    }
  }

  async fetchTokenPriceInUSD(symbol: string): Promise<number | null> {
    try {
      const response = await this.api.get(`/v2/rates?tokens=${symbol}&currencies=usd`);
      return response.data.rates.TON.prices.USD;
    } catch (error) {
      console.error(`Error fetching price for ${symbol}`, error);
      return null;
    }
  }

  async fetchTokenBalance(address: string): Promise<string | null> {
    try {
      const walletAddress = this.configService.get<string>('WALLET_ADDRESS');
      const response = await this.api.get(`/v2/accounts/${walletAddress}/jettons/${address}`);
      const balance = response.data.balance;
      return balance !== '' ? balance : null;
    } catch (error) {
      console.error(`Error fetching balance for ${address}`, error);
      return null;
    }
  }

  async getAccountEvents(address: string, limit = 1): Promise<AccountEvent[] | null> {
    try {
      const response = await this.api.get(`/v2/accounts/${address}/events?limit=${limit}`);
      return response.data.events;
    } catch (error) {
      console.error(`Error fetching events for account`, error);
      return null;
    }
  }

  async getAccountTransactions(
    address: string,
    limit = 1,
    sortOrder = 'desc',
  ): Promise<AccountTransaction[] | null> {
    try {
      const response = await this.api.get(
        `/v2/blockchain/accounts/${address}/transactions?limit=${limit}&sort_order=${sortOrder}`,
      );
      return response.data.transactions;
    } catch (error) {
      console.error(`Error fetching transactions for account`, error);
      return null;
    }
  }

  async checkTokenTransaction(
    transaction: Transaction,
    token: Token,
    walletAddress: string,
  ): Promise<TransactionCheckResult> {
    try {
      const events = await this.getAccountEvents(walletAddress, 30);
      if (!events) {
        return { success: false };
      }

      const isBuyTransaction = transaction.type === TransactionType.Buy;

      for (const event of events) {
        const jettonSwapAction = event.actions.find((action) => action.type === 'JettonSwap');
        if (jettonSwapAction && jettonSwapAction.type === 'JettonSwap') {
          const swap = jettonSwapAction.JettonSwap;
          if (!swap) {
            continue;
          }

          if (isBuyTransaction) {
            const expectedTonAmount = new BigNumber(transaction.amount_ton)
              .plus(SWAP_GAS_AMOUNT)
              .multipliedBy(1e9)
              .integerValue();

            const actualTonAmount = new BigNumber(swap.ton_in || 0);
            const isMatch =
              actualTonAmount.isEqualTo(expectedTonAmount) &&
              swap.jetton_master_out?.address === token.raw_address;

            if (isMatch) {
              return this.processMatchedEvent(
                event,
                jettonSwapAction,
                swap,
                isBuyTransaction,
                transaction,
              );
            }
          } else {
            const expectedTokenAmount = new BigNumber(transaction.amount_token)
              .multipliedBy(10 ** Number(token.metadata.decimals))
              .integerValue();

            const isMatch =
              swap.amount_in !== undefined &&
              new BigNumber(swap.amount_in).isEqualTo(expectedTokenAmount) &&
              swap.jetton_master_in?.address === token.raw_address;

            if (isMatch) {
              return this.processMatchedEvent(
                event,
                jettonSwapAction,
                swap,
                isBuyTransaction,
                transaction,
              );
            }
          }
        }
      }

      return { success: false };
    } catch (error) {
      this.logger.error(`Error in checkTokenTransaction: ${error}`);
      return { success: false };
    }
  }

  private processMatchedEvent(
    event: any,
    jettonSwapAction: any,
    swap: any,
    isBuyTransaction: boolean,
    transaction: Transaction,
  ): TransactionCheckResult {
    const isSuccessful = jettonSwapAction.status === 'ok';
    if (isSuccessful) {
      const tokenAmount = isBuyTransaction ? swap.amount_out || '0' : swap.amount_in || '0';
      const currencyAmount = new BigNumber(transaction.amount_ton);
      return {
        success: true,
        tokenAmount,
        transaction_id: event.event_id,
        currencyAmount: currencyAmount.toNumber(),
      };
    } else {
      return { success: false, transaction_id: event.event_id };
    }
  }

  async getRecentTrades(poolAddress: string, decimals: number): Promise<Trade[]> {
    const events = await this.getAccountEvents(poolAddress, 100);
    if (!events) return [];

    return this.analyseEvents(events, decimals);
  }

  private analyseEvents(events: AccountEvent[], decimals: number): Trade[] {
    return events.flatMap((event) => {
      if (event.actions.some((action) => action.type === 'JettonMint')) {
        return [];
      }

      const stonFiTrade = this.analyseStonFiEvent(event, decimals);
      const dedustTrade = this.analyseDedustEvent(event, decimals);

      return [stonFiTrade, dedustTrade].filter(Boolean) as Trade[];
    });
  }

  private analyseStonFiEvent(event: AccountEvent, decimals: number): Trade | null {
    const jettonSwapAction = event.actions.find(
      (action): action is AccountEvent['actions'][number] & { type: 'JettonSwap'; status: 'ok' } =>
        action.type === 'JettonSwap' &&
        action.status === 'ok' &&
        action.JettonSwap?.dex === 'stonfi',
    );

    if (jettonSwapAction && jettonSwapAction.JettonSwap) {
      const { amount_in, amount_out, ton_in, ton_out } = jettonSwapAction.JettonSwap;

      let tokenAmount: BigNumber;
      let tonAmount: BigNumber;
      let type: 'buy' | 'sell';

      if (amount_in && amount_in !== '') {
        type = 'sell';
        tokenAmount = new BigNumber(amount_in).dividedBy(10 ** decimals);
        tonAmount = new BigNumber(ton_out || 0).dividedBy(1e9);
      } else if (amount_out && amount_out !== '') {
        type = 'buy';
        tokenAmount = new BigNumber(amount_out).dividedBy(10 ** decimals);
        tonAmount = new BigNumber(ton_in || 0).dividedBy(1e9);
      } else {
        return null;
      }

      return { type, tokenAmount, tonAmount };
    }

    return null;
  }

  private analyseDedustEvent(event: AccountEvent, decimals: number): Trade | null {
    const swapAction = event.actions.find(
      (action): action is AccountEvent['actions'][number] & { type: 'SmartContractExec' } =>
        action.type === 'SmartContractExec' &&
        action.SmartContractExec?.operation === 'DedustSwapExternal',
    );

    const payoutAction = event.actions.find(
      (action): action is AccountEvent['actions'][number] & { type: 'SmartContractExec' } =>
        action.type === 'SmartContractExec' &&
        action.SmartContractExec?.operation === 'DedustPayoutFromPool',
    );

    if (
      swapAction &&
      swapAction.SmartContractExec &&
      swapAction.status === 'ok' &&
      payoutAction &&
      payoutAction.SmartContractExec
    ) {
      const swapAmount = new BigNumber(
        this.parseDedustAmount(swapAction.SmartContractExec.payload, 'Amount'),
      );
      const payoutAmount = new BigNumber(
        this.parseDedustAmount(payoutAction.SmartContractExec.payload, 'Amount'),
      );

      let tokenAmount: BigNumber;
      let tonAmount: BigNumber;
      let type: 'buy' | 'sell';

      if (swapAmount.isLessThan(payoutAmount)) {
        type = 'buy';
        tokenAmount = payoutAmount.dividedBy(10 ** decimals);
        tonAmount = swapAmount.dividedBy(1e9);
      } else {
        type = 'sell';
        tokenAmount = swapAmount.dividedBy(10 ** decimals);
        tonAmount = payoutAmount.dividedBy(1e9);
      }

      return { type, tokenAmount, tonAmount };
    }

    return null;
  }

  private parseDedustAmount(payload: string, key: string): string {
    const regex = new RegExp(`${key}\\s*=\\s*(\\d+)`);
    const match = payload.match(regex);
    return match ? match[1] : '0';
  }
}
