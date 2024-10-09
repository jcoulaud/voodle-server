import { SWAP_GAS_AMOUNT } from '@/constants';
import { normalizeTokenAmount } from '@/helpers';
import { Pool, Token } from '@/types';
import {
  BuyAction,
  BuyCondition,
  SellAction,
  SellCondition,
  StrategyLogic,
  TokenEvaluation,
} from '@/types/strategy.types';
import { Process, Processor } from '@nestjs/bull';
import { Inject, Injectable, Logger } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { Job } from 'bull';
import { differenceInDays } from 'date-fns';
import { TOKEN_SYMBOL_BLACKLIST } from 'src/constants/tokenBlacklist';
import { StrategyService } from '../db/strategy.service';
import { TokenService } from '../db/token.service';
import { TransactionService } from '../db/transaction.service';
import { UserService } from '../db/user.service';
import { TonApiService } from '../integrations/ton-api.service';
import { WalletService } from '../wallet/wallet.service';
import { TradeExecutorService } from './trade-executor.service';

@Injectable()
@Processor('strategy-evaluation')
export class StrategyExecutorService {
  private readonly logger = new Logger(StrategyExecutorService.name);

  constructor(
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(StrategyService) private readonly strategyService: StrategyService,
    @Inject(TonApiService) private readonly tonApiService: TonApiService,
    @Inject(TradeExecutorService) private readonly tradeExecutorService: TradeExecutorService,
    @Inject(TransactionService) private readonly transactionService: TransactionService,
    @Inject(UserService) private readonly userService: UserService,
    @Inject(WalletService) private readonly walletService: WalletService,
  ) {}

  // --------------------------------------------------------------
  // ---------------------- Action Execution ----------------------
  // --------------------------------------------------------------

  @Process('evaluate')
  async executeStrategy(job: Job<TokenEvaluation>) {
    const { tokenId, strategyId, userId } = job.data;

    try {
      const token = await this.tokenService.getTokenById(tokenId);
      const strategy = await this.strategyService.getStrategyById(strategyId);
      // console.log(`Evaluating strategy ${strategyId} for token ${tokenId}`);

      if (!token || !strategy) {
        this.logger.error(`Token or strategy not found for evaluation`);
        return null;
      }

      const hasPendingTransaction = await this.transactionService.hasPendingTransaction(
        userId,
        tokenId,
        strategyId,
      );
      if (hasPendingTransaction) {
        this.logger.warn(
          `Skipping evaluation for token ${tokenId} and strategy ${strategyId} as there's a recent pending transaction`,
        );
        return null;
      }

      const balance = await this.tokenService.getTokenBalance(userId, tokenId);
      const result = await this.evaluateStrategy(token, strategy.strategyLogic, balance);

      if (result.shouldSell && result.sellActionToExecute) {
        this.logger.log(
          `Strategy ${strategyId} for user ${userId} and token ${token.metadata.symbol}: SELL`,
        );
        await this.executeSellAction(
          userId,
          strategyId,
          token,
          balance,
          result.sellActionToExecute,
        );
      } else if (result.shouldBuy) {
        this.logger.log(
          `Strategy ${strategyId} for user ${userId} and token ${token.metadata.symbol}: BUY`,
        );
        await this.executeBuyAction(
          userId,
          strategyId,
          token,
          strategy.strategyLogic.buy?.action,
          strategy.maxBetAmount,
        );
      }

      return result;
    } catch (error) {
      this.logger.error(`Error executing strategy ${strategyId} for token ${tokenId}:`, error);
      return null;
    }
  }

  private async executeBuyAction(
    userId: number,
    strategyId: number,
    token: Token,
    buyAction: BuyAction,
    maxBetAmount: number,
  ) {
    const bestDexInfo = this.getBestDexInfo(token);
    if (!bestDexInfo) {
      this.logger.error(`No valid DEX information found for ${token.metadata.symbol}. Cannot buy.`);
      return;
    }

    try {
      const [netInvestment, user, pendingAmount] = await Promise.all([
        this.transactionService.getNetInvestmentForStrategy(strategyId),
        this.userService.findUserById(userId),
        this.transactionService.getPendingInvestmentForStrategy(strategyId),
      ]);

      if (!user) {
        this.logger.error(`User not found for ID ${userId}`);
        return;
      }

      const userWallets = await this.walletService.getUserWallets(user.id);
      const tonWallet = userWallets.find((wallet) => wallet.blockchain === 'ton');

      if (!tonWallet) {
        this.logger.error(`TON wallet not found for user ${userId}`);
        return;
      }

      const walletBalance = await this.walletService.getAccountBalance(tonWallet.address);
      const normalizedWalletBalance = normalizeTokenAmount(
        walletBalance,
        Number(token.metadata.decimals),
      ).toFixed(Number(token.metadata.decimals));

      const newBuyAmount = buyAction.amount + Number(SWAP_GAS_AMOUNT);
      const availableBettingAmount = Math.max(maxBetAmount - netInvestment - pendingAmount, 0);

      if (newBuyAmount > availableBettingAmount) {
        this.logger.warn(`Exceeding available amount for strategy ${strategyId}. Skipping buy.`);
        return;
      }

      if (newBuyAmount > Number(normalizedWalletBalance)) {
        this.logger.warn(`Insufficient funds in wallet for user ${userId}. Skipping buy.`);
        return;
      }

      const success = await this.tradeExecutorService.buyToken(
        userId,
        strategyId,
        token,
        buyAction.amount,
        bestDexInfo,
      );

      if (!success) {
        this.logger.error(
          `Failed to execute buy action for token ${token.metadata.symbol} in strategy ${strategyId}`,
        );
      } else {
        this.logger.log(
          `Successfully executed buy action for token ${token.metadata.symbol} in strategy ${strategyId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error executing buy action for token ${token.metadata.symbol} in strategy ${strategyId}:`,
        error,
      );
    }
  }

  private async executeSellAction(
    userId: number,
    strategyId: number,
    token: Token,
    balance: BigNumber,
    sellAction?: SellAction,
  ) {
    if (!sellAction) {
      this.logger.error(`No valid sell action found for strategy ${strategyId}`);
      return;
    }

    const bestDexInfo = this.getBestDexInfo(token);
    if (!bestDexInfo) {
      this.logger.error(
        `No valid DEX information found for ${token.metadata.symbol}. Cannot sell.`,
      );
      return;
    }

    try {
      const user = await this.userService.findUserById(userId);
      if (!user) {
        this.logger.error(`User not found for ID ${userId}`);
        return;
      }

      const userWallets = await this.walletService.getUserWallets(user.id);
      const tonWallet = userWallets.find((wallet) => wallet.blockchain === 'ton');

      if (!tonWallet) {
        this.logger.error(`TON wallet not found for user ${userId}`);
        return;
      }

      const walletBalance = await this.walletService.getAccountBalance(tonWallet.address);
      const normalizedWalletBalance = normalizeTokenAmount(
        walletBalance,
        Number(token.metadata.decimals),
      ).toFixed(Number(token.metadata.decimals));

      if (new BigNumber(normalizedWalletBalance).isLessThan(SWAP_GAS_AMOUNT)) {
        this.logger.warn(
          `Insufficient TON balance to cover gas fees for user ${userId}. Skipping sell.`,
        );
        return;
      }

      const amountToSell = this.calculateSellAmount(sellAction, balance);
      if (amountToSell.isGreaterThan(0)) {
        const success = await this.tradeExecutorService.sellToken(
          userId,
          strategyId,
          token,
          amountToSell,
          bestDexInfo,
        );

        if (!success) {
          this.logger.error(
            `Failed to execute sell action for token ${token.metadata.symbol} in strategy ${strategyId}`,
          );
        } else {
          this.logger.log(
            `Successfully executed sell action for token ${token.metadata.symbol} in strategy ${strategyId}`,
          );
        }
      } else {
        this.logger.warn(
          `Calculated sell amount is 0 or negative for token ${token.metadata.symbol}. Skipping sell.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error executing sell action for token ${token.metadata.symbol} in strategy ${strategyId}:`,
        error,
      );
    }
  }

  private calculateSellAmount(sellAction: SellAction, balance: BigNumber): BigNumber {
    switch (sellAction.type) {
      case 'percentageOfHoldings':
        return balance.multipliedBy(sellAction.amount / 100);
      default:
        return new BigNumber(0);
    }
  }

  // ------------------------------------------------------------
  // ------------------- Strategy Evaluation --------------------
  // ------------------------------------------------------------

  private async evaluateStrategy(
    token: Token,
    strategy: StrategyLogic,
    balance: BigNumber,
  ): Promise<{ shouldBuy: boolean; shouldSell: boolean; sellActionToExecute?: SellAction }> {
    let shouldBuy = false;
    let shouldSell = false;
    let sellActionToExecute: SellAction | undefined;

    if (balance.isGreaterThan(0) && strategy.sell) {
      for (const sellStrategy of strategy.sell) {
        shouldSell = await this.evaluateSellCondition(token, sellStrategy.condition);
        if (shouldSell) {
          sellActionToExecute = sellStrategy.action;
          break;
        }
      }
    } else if (strategy.buy && balance.isEqualTo(0)) {
      shouldBuy = await this.evaluateBuyConditions(token, strategy.buy.conditions);
    }

    return { shouldBuy, shouldSell, sellActionToExecute };
  }

  // --------------------------------------------------------------
  // -------------------- Condition Evaluation --------------------
  // --------------------------------------------------------------

  private async evaluateBuyConditions(token: Token, conditions: BuyCondition[]): Promise<boolean> {
    for (const condition of conditions) {
      if (!(await this.evaluateBuyCondition(token, condition))) {
        return false;
      }
    }
    return true;
  }

  private async evaluateBuyCondition(token: Token, condition: BuyCondition): Promise<boolean> {
    switch (condition.type) {
      case 'tokenName':
        return this.evaluateTokenNameCondition(token, condition);
      case 'marketCap':
        return this.evaluateMarketCapCondition(token, condition);
      case 'liquidity':
        return this.evaluateLiquidityCondition(token, condition);
      case 'price':
        return this.evaluatePriceCondition(token, condition);
      case 'age':
        return this.evaluateAgeCondition(token, condition);
      case 'blacklist':
        return this.evaluateBlacklistCondition(token, condition);
      default:
        return false;
    }
  }

  private async evaluateSellCondition(token: Token, condition: SellCondition): Promise<boolean> {
    switch (condition.type) {
      case 'price':
        return this.evaluatePriceChangeCondition(token, condition);
      default:
        return false;
    }
  }

  private evaluateTokenNameCondition(
    token: Token,
    condition: { type: 'tokenName'; operator: 'contains'; value: string },
  ): boolean {
    return token.metadata.symbol.toLowerCase().includes(condition.value.toLowerCase());
  }

  private evaluateMarketCapCondition(
    token: Token,
    condition: {
      type: 'marketCap';
      operator: 'greaterThan' | 'lessThan' | 'between';
      value: number | [number, number];
    },
  ): boolean {
    const bestDexInfo = this.getBestDexInfo(token);
    if (!bestDexInfo || !bestDexInfo.market_cap_in_usd) return false;
    const marketCap = parseFloat(bestDexInfo.market_cap_in_usd);
    switch (condition.operator) {
      case 'greaterThan':
        return marketCap > (condition.value as number);
      case 'lessThan':
        return marketCap < (condition.value as number);
      case 'between':
        const [min, max] = condition.value as [number, number];
        return marketCap >= min && marketCap <= max;
    }
  }

  private evaluateLiquidityCondition(
    token: Token,
    condition: {
      type: 'liquidity';
      operator: 'greaterThan' | 'lessThan' | 'between';
      value: number | [number, number];
    },
  ): boolean {
    const bestDexInfo = this.getBestDexInfo(token);
    if (!bestDexInfo || !bestDexInfo.total_liquidity_in_usd) return false;
    const liquidity = parseFloat(bestDexInfo.total_liquidity_in_usd);
    switch (condition.operator) {
      case 'greaterThan':
        return liquidity > (condition.value as number);
      case 'lessThan':
        return liquidity < (condition.value as number);
      case 'between':
        const [min, max] = condition.value as [number, number];
        return liquidity >= min && liquidity <= max;
    }
  }

  private evaluatePriceCondition(
    token: Token,
    condition: {
      type: 'price';
      operator: 'greaterThan' | 'lessThan' | 'between';
      value: number | [number, number];
    },
  ): boolean {
    const bestDexInfo = this.getBestDexInfo(token);
    if (!bestDexInfo || !bestDexInfo.price_in_usd) return false;
    const price = parseFloat(bestDexInfo.price_in_usd);
    switch (condition.operator) {
      case 'greaterThan':
        return price > (condition.value as number);
      case 'lessThan':
        return price < (condition.value as number);
      case 'between':
        const [min, max] = condition.value as [number, number];
        return price >= min && price <= max;
    }
  }

  private evaluateAgeCondition(
    token: Token,
    condition: {
      type: 'age';
      operator: 'greaterThan' | 'lessThan' | 'equal';
      days: number;
    },
  ): boolean {
    if (!token.created_at) return false;

    const now = new Date();
    if (token.created_at > now) {
      this.logger.error(`Token ${token.id} has a future creation date: ${token.created_at}`);
      return false;
    }

    const tokenAge = differenceInDays(now, token.created_at);

    switch (condition.operator) {
      case 'greaterThan':
        return tokenAge > condition.days;
      case 'lessThan':
        return tokenAge < condition.days;
      case 'equal':
        return tokenAge === condition.days;
      default:
        this.logger.error(`Invalid operator for age condition: ${condition.operator}`);
        return false;
    }
  }

  private evaluateBlacklistCondition(
    token: Token,
    condition: { type: 'blacklist'; checkDollarSign: boolean; checkBlacklist: boolean },
  ): boolean {
    const { symbol } = token.metadata;
    let result = true;

    if (condition.checkDollarSign) {
      result = result && !symbol.includes('$');
    }

    if (condition.checkBlacklist) {
      const lowercaseSymbol = symbol.toLowerCase();
      result =
        result &&
        !TOKEN_SYMBOL_BLACKLIST.some((word) => lowercaseSymbol.includes(word.toLowerCase()));
    }

    return result;
  }

  private async evaluatePriceChangeCondition(
    token: Token,
    condition: { type: 'price'; operator: 'increasedBy' | 'decreasedBy'; value: number },
  ): Promise<boolean> {
    const bestDexInfo = this.getBestDexInfo(token);
    if (!bestDexInfo || !bestDexInfo.price_in_usd) return false;

    const currentPrice = parseFloat(bestDexInfo.price_in_usd);
    const lastTransactionPrice = await this.transactionService.getLatestTransactionPrice(token.id);

    if (!lastTransactionPrice) return false;

    const priceChange = ((currentPrice - lastTransactionPrice) / lastTransactionPrice) * 100;

    if (condition.operator === 'increasedBy') {
      return priceChange >= condition.value;
    } else {
      return priceChange <= -condition.value;
    }
  }

  private async evaluateMinimumTradesCondition(
    token: Token,
    condition: { type: 'minimumTrades'; count: number },
  ): Promise<boolean> {
    const bestDexInfo = this.getBestDexInfo(token);
    if (!bestDexInfo) return false;

    const trades = await this.tonApiService.getRecentTrades(
      bestDexInfo.pool_address,
      Number(token.metadata.decimals),
    );
    return trades.length >= condition.count;
  }

  private async evaluateSellRatioCondition(
    token: Token,
    condition: { type: 'sellRatio'; min: number; max: number },
  ): Promise<boolean> {
    const bestDexInfo = this.getBestDexInfo(token);
    if (!bestDexInfo) return false;

    const trades = await this.tonApiService.getRecentTrades(
      bestDexInfo.pool_address,
      Number(token.metadata.decimals),
    );
    const { buyCount, sellCount } = this.countTrades(trades);
    const totalTrades = buyCount + sellCount;
    if (totalTrades === 0) return false;

    const sellRatio = sellCount / totalTrades;
    return sellRatio >= condition.min && sellRatio <= condition.max;
  }

  private async evaluateBuyRatioCondition(
    token: Token,
    condition: { type: 'buyRatio'; min: number; max: number },
  ): Promise<boolean> {
    const bestDexInfo = this.getBestDexInfo(token);
    if (!bestDexInfo) return false;

    const trades = await this.tonApiService.getRecentTrades(
      bestDexInfo.pool_address,
      Number(token.metadata.decimals),
    );
    const { buyCount, sellCount } = this.countTrades(trades);
    const totalTrades = buyCount + sellCount;
    if (totalTrades === 0) return false;

    const buyRatio = buyCount / totalTrades;
    return buyRatio >= condition.min && buyRatio <= condition.max;
  }

  private async evaluateLargeTradeRatioCondition(
    token: Token,
    condition: {
      type: 'largeTradeRatio';
      min: number;
      max: number;
      largeTradeThreshold: number;
      tradeType: 'buy' | 'sell' | 'both';
    },
  ): Promise<boolean> {
    const bestDexInfo = this.getBestDexInfo(token);
    if (!bestDexInfo) return false;

    const trades = await this.tonApiService.getRecentTrades(
      bestDexInfo.pool_address,
      Number(token.metadata.decimals),
    );
    const { largeCount, totalCount } = this.countLargeTrades(
      trades,
      condition.largeTradeThreshold,
      condition.tradeType,
    );

    if (totalCount === 0) return false;

    const largeTradeRatio = largeCount / totalCount;
    return largeTradeRatio >= condition.min && largeTradeRatio <= condition.max;
  }

  // --------------------------------------------------------------
  // ---------------------- Helper Functions ----------------------
  // --------------------------------------------------------------

  private getBestDexInfo(token: Token): Pool | null {
    if (!token.dexInfo || token.dexInfo.length === 0) return null;
    return token.dexInfo.reduce((best, current) =>
      parseFloat(current.total_liquidity_in_usd || '0') >
      parseFloat(best.total_liquidity_in_usd || '0')
        ? current
        : best,
    );
  }

  private countTrades(trades: any[]): { buyCount: number; sellCount: number } {
    return trades.reduce(
      (counts, trade) => {
        if (trade.type === 'buy') {
          counts.buyCount++;
        } else {
          counts.sellCount++;
        }
        return counts;
      },
      { buyCount: 0, sellCount: 0 },
    );
  }

  private countLargeTrades(
    trades: any[],
    largeTradeThreshold: number,
    tradeType: 'buy' | 'sell' | 'both',
  ): { largeCount: number; totalCount: number } {
    return trades.reduce(
      (counts, trade) => {
        if (tradeType === 'both' || trade.type === tradeType) {
          counts.totalCount++;
          if (trade.tonAmount.isGreaterThan(largeTradeThreshold)) {
            counts.largeCount++;
          }
        }
        return counts;
      },
      { largeCount: 0, totalCount: 0 },
    );
  }
}
