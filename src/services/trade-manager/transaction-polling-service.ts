import { normalizeTokenAmount } from '@/helpers';
import { Token, Transaction, TransactionStatus, TransactionType } from '@/types';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { differenceInHours } from 'date-fns';
import { TokenService } from '../db/token.service';
import { TransactionService } from '../db/transaction.service';
import { TonApiService } from '../integrations/ton-api.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class TransactionPollingService implements OnModuleInit {
  private readonly logger = new Logger(TransactionPollingService.name);
  private isPolling = false;

  constructor(
    @Inject(TransactionService) private readonly transactionService: TransactionService,
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(TonApiService) private readonly tonApiService: TonApiService,
    @Inject(WalletService) private readonly walletService: WalletService,
  ) {}

  onModuleInit() {}

  @Interval(10000)
  async startPolling() {
    if (this.isPolling) {
      this.logger.debug('Polling already in progress, skipping this cycle');
      return;
    }
    this.isPolling = true;

    try {
      const pendingTransactions = await this.transactionService.getPendingTransactions();

      await Promise.all(
        pendingTransactions.map((transaction) => this.checkTransaction(transaction)),
      );
    } catch (error) {
      this.logger.error('Error during transaction polling:', error);
    } finally {
      this.isPolling = false;
    }
  }

  private async checkTransaction(transaction: Transaction): Promise<void> {
    try {
      const transactionAge = differenceInHours(new Date(), new Date(transaction.created_at));
      if (transactionAge >= 24) {
        this.logger.warn(`Transaction ${transaction.id} is over 24 hours old, marking as failed`);
        await this.updateTransactionStatus(transaction, TransactionStatus.Failed);
        return;
      }

      const token = await this.tokenService.getTokenById(transaction.token_id);
      if (!token) {
        this.logger.warn(`Token not found for transaction ${transaction.id}`);
        return;
      }

      const userWallets = await this.walletService.getUserWallets(transaction.user_id);
      const tonWallet = userWallets.find((wallet) => wallet.blockchain === 'ton');

      if (!tonWallet) {
        this.logger.error(`No TON wallet found for user ${transaction.user_id}`);
        return;
      }

      const result = await this.tonApiService.checkTokenTransaction(
        transaction,
        token,
        tonWallet.address,
      );

      if (result.transaction_id) {
        if (result.success && result.tokenAmount !== undefined) {
          const tonOut = result.currencyAmount !== undefined ? result.currencyAmount : undefined;
          await this.processSuccessfulTransaction(
            transaction,
            token,
            result.tokenAmount.toString(),
            result.transaction_id,
            tonOut,
          );
        } else {
          await this.updateTransactionStatus(
            transaction,
            TransactionStatus.Failed,
            result.transaction_id,
          );
          this.logger.warn(`Transaction ${transaction.id} failed, updating status`);
        }
      } else {
        this.logger.debug(`Transaction ${transaction.id} not found or still pending`);
      }
    } catch (error) {
      this.logger.error(`Error checking transaction ${transaction.id}:`, error);
    }
  }

  private async processSuccessfulTransaction(
    transaction: Transaction,
    token: Token,
    receivedAmount: string,
    transactionId: string,
    tonOut?: number,
  ): Promise<void> {
    this.logger.log(`Transaction ${transaction.id} successful, updating status and balance`);

    const normalizedAmount = normalizeTokenAmount(
      transaction.type === TransactionType.Buy ? receivedAmount : tonOut,
      token.metadata.decimals,
    ).toString();

    const updateData: Partial<Transaction> = {
      status: TransactionStatus.Success,
      transaction_id: transactionId,
    };

    if (transaction.type === TransactionType.Buy) {
      updateData.amount_token = normalizedAmount;
      await this.updateTokenBalance(transaction.user_id, token.id, normalizedAmount, true);
    } else if (transaction.type === TransactionType.Sell) {
      updateData.amount_ton = normalizedAmount;
      await this.updateTokenBalance(transaction.user_id, token.id, transaction.amount_token, false);
    }

    await this.transactionService.updateTransaction(transaction.id, updateData);
    this.logger.log(
      `Updated transaction ${transaction.id} with new amounts, balance, and transaction_id`,
    );
  }

  private async updateTokenBalance(
    userId: number,
    tokenId: number,
    amount: string,
    isIncrease: boolean,
  ): Promise<void> {
    try {
      const currentBalance = await this.tokenService.getTokenBalance(userId, tokenId);
      const newBalance = isIncrease ? currentBalance.plus(amount) : currentBalance.minus(amount);

      await this.tokenService.updateTokenBalance(userId, tokenId, newBalance);
      this.logger.log(`Updated token balance for user ${userId}, token ${tokenId}`);
    } catch (error) {
      this.logger.error(`Error updating token balance:`, error);
    }
  }

  private async updateTransactionStatus(
    transaction: Transaction,
    status: TransactionStatus,
    transaction_id?: string,
  ): Promise<void> {
    const updateData: Partial<Transaction> = { status };
    if (transaction_id) {
      updateData.transaction_id = transaction_id;
    }
    await this.transactionService.updateTransaction(transaction.id, updateData);
    this.logger.log(`Updated transaction ${transaction.id} status to ${status}`);
  }
}
