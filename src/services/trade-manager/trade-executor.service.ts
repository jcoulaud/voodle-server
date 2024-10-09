import { TRANSACTION_FEE_PERCENTAGE, TRANSFER_GAS_AMOUNT } from '@/constants';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import BigNumber from 'bignumber.js';
import { Dex, Pool, Token, TransactionResult, TransactionStatus, TransactionType } from 'src/types';
import { FeeService } from '../db/fee.service';
import { TransactionService } from '../db/transaction.service';
import { DeDustService } from '../exchanges/dedust.service';
import { StonFiService } from '../exchanges/stonfi.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class TradeExecutorService {
  private readonly logger = new Logger(TradeExecutorService.name);

  constructor(
    @Inject(TransactionService) private readonly transactionService: TransactionService,
    @Inject(DeDustService) private readonly deDustService: DeDustService,
    @Inject(StonFiService) private readonly stonFiService: StonFiService,
    @Inject(WalletService) private readonly walletService: WalletService,
    @Inject(FeeService) private readonly feeService: FeeService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async buyToken(
    userId: number,
    strategyId: number,
    token: Token,
    amountToBuy: number,
    bestDexInfo: Pool,
  ): Promise<boolean> {
    return this.executeTradeAndCreateTransaction(
      userId,
      strategyId,
      token,
      amountToBuy.toString(),
      bestDexInfo,
      TransactionType.Buy,
    );
  }

  async sellToken(
    userId: number,
    strategyId: number,
    token: Token,
    amountToSell: BigNumber,
    bestDexInfo: Pool,
  ): Promise<boolean> {
    const amountToSellString = amountToSell.toFixed(9, BigNumber.ROUND_DOWN);
    return this.executeTradeAndCreateTransaction(
      userId,
      strategyId,
      token,
      amountToSellString,
      bestDexInfo,
      TransactionType.Sell,
    );
  }

  private async transferFee(
    userId: number,
    feeAmount: string,
    transactionId: number,
  ): Promise<void> {
    try {
      const userWallets = await this.walletService.getUserWallets(userId);
      const tonWallet = userWallets.find((wallet) => wallet.blockchain === 'ton');

      if (!tonWallet) {
        throw new Error('User does not have a TON wallet');
      }

      if (new BigNumber(feeAmount).isGreaterThan(TRANSFER_GAS_AMOUNT)) {
        const result = await this.walletService.withdrawFunds(
          userId,
          tonWallet.address,
          this.configService.get('FEE_RECIPIENT_WALLET'),
          feeAmount,
        );

        if (result.success) {
          await this.feeService.createFee({
            user_id: userId,
            amount_ton: feeAmount,
            transaction_id: transactionId,
          });
        }
      } else {
        await this.feeService.createFee({
          user_id: userId,
          amount_ton: '0',
          transaction_id: transactionId,
        });
      }
    } catch (error) {
      this.logger.error(`Error transferring fee: ${error.message}`);
      // TODO: handle fee transfer failures
    }
  }

  private async executeTradeAndCreateTransaction(
    userId: number,
    strategyId: number,
    token: Token,
    amount: string,
    bestDexInfo: Pool,
    transactionType: TransactionType,
  ): Promise<boolean> {
    if (!bestDexInfo || !bestDexInfo.price_in_usd) {
      this.logger.error(`No valid price information found. Cannot ${transactionType}.`);
      return false;
    }

    const dex = this.getDexService(bestDexInfo.dex);
    if (!dex) {
      this.logger.error(`Unknown DEX ${bestDexInfo.dex} for token. Cannot ${transactionType}.`);
      return false;
    }

    this.logger.log(
      `${transactionType === TransactionType.Buy ? 'Buying' : 'Selling'} ${amount} ${
        transactionType === TransactionType.Buy ? 'TON' : token.metadata.symbol
      } on ${bestDexInfo.dex}...`,
    );

    try {
      let transactionResult: TransactionResult;
      let feeAmount: BigNumber;
      let estimatedTonAmount: BigNumber;

      if (transactionType === TransactionType.Buy) {
        const amountBN = new BigNumber(amount);
        feeAmount = amountBN.multipliedBy(TRANSACTION_FEE_PERCENTAGE);
        const amountAfterFee = amountBN.minus(feeAmount);
        transactionResult = await dex.buyToken(
          userId,
          token.friendly_address,
          amountAfterFee.toNumber(),
        );
        estimatedTonAmount = amountAfterFee;
      } else {
        transactionResult = await dex.sellToken(userId, token.friendly_address, amount);
        estimatedTonAmount = new BigNumber(amount).multipliedBy(bestDexInfo.price_in_usd);
      }

      if (transactionResult.status === TransactionStatus.Success) {
        let tokenAmount = transactionType === TransactionType.Buy ? '0' : amount;

        if (transactionType === TransactionType.Sell) {
          feeAmount = estimatedTonAmount.multipliedBy(TRANSACTION_FEE_PERCENTAGE);
        }

        const pendingTransactionId = await this.transactionService.createTransaction({
          token_id: token.id,
          strategy_id: strategyId,
          user_id: userId,
          type: transactionType,
          amount_token: tokenAmount,
          amount_ton: estimatedTonAmount.toString(),
          price_in_usd: bestDexInfo.price_in_usd,
          dex: bestDexInfo.dex,
          status: TransactionStatus.Pending,
        });

        const feeAmountString = feeAmount.toFixed(Number(token.metadata.decimals));

        await this.transferFee(userId, feeAmountString, pendingTransactionId);

        this.logger.log(`Transaction ${pendingTransactionId} created and set to pending`);
        return true;
      } else {
        this.logger.error(`Transaction failed: ${transactionResult.status}`);
        return false;
      }
    } catch (error) {
      this.logger.error(
        `Error ${transactionType === TransactionType.Buy ? 'buying' : 'selling'} token: ${error}`,
      );
      return false;
    }
  }

  private getDexService(dex: Dex): DeDustService | StonFiService | null {
    switch (dex) {
      case Dex.DeDust:
        return this.deDustService;
      case Dex.StonFi:
        return this.stonFiService;
      default:
        return null;
    }
  }
}
