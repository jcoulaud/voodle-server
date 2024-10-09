import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { transactions } from '../../db/schema';
import { Dex, PaginatedResult, Transaction, TransactionStatus, TransactionType } from '../../types';

@Injectable()
export class TransactionService {
  constructor(@Inject('DATABASE_CONNECTION') private db: NodePgDatabase) {}

  async createTransaction(transactionData: {
    token_id: number;
    strategy_id: number;
    user_id: number;
    type: TransactionType;
    amount_token: string;
    amount_ton: string;
    price_in_usd: string;
    dex: Dex;
    status: TransactionStatus;
  }): Promise<number> {
    try {
      const [result] = await this.db
        .insert(transactions)
        .values(transactionData)
        .returning({ id: transactions.id });
      return result.id;
    } catch (error) {
      console.error(`Error creating transaction:`, error);
      throw error;
    }
  }

  async updateTransaction(
    transactionId: number,
    updatedData: Partial<{
      status: TransactionStatus;
      amount_token: string;
      amount_ton: string;
      transaction_id: string;
    }>,
  ): Promise<void> {
    try {
      await this.db.update(transactions).set(updatedData).where(eq(transactions.id, transactionId));
    } catch (error) {
      console.error(`Error updating transaction ${transactionId}:`, error);
      throw error;
    }
  }

  async getUserTransactions(
    userId: number,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<Transaction>> {
    try {
      const offset = (page - 1) * limit;
      const userTransactions = await this.db
        .select()
        .from(transactions)
        .where(eq(transactions.user_id, userId))
        .orderBy(desc(transactions.created_at))
        .limit(limit)
        .offset(offset);

      const [{ total }] = await this.db
        .select({ total: sql<number>`count(*)` })
        .from(transactions)
        .where(eq(transactions.user_id, userId));

      return {
        data: userTransactions.map((transaction) => ({
          ...transaction,
          type: transaction.type as TransactionType,
          dex: transaction.dex as Dex,
          status: transaction.status as TransactionStatus,
        })),
        total,
        page,
        limit,
      };
    } catch (error) {
      console.error(`Error fetching transactions for user ${userId}:`, error);
      throw error;
    }
  }

  async getTransactionById(transactionId: number): Promise<Transaction | null> {
    try {
      const [transaction] = await this.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, transactionId))
        .limit(1);

      if (!transaction) {
        return null;
      }

      return {
        ...transaction,
        type: transaction.type as TransactionType,
        dex: transaction.dex as Dex,
        status: transaction.status as TransactionStatus,
      } as Transaction;
    } catch (error) {
      console.error(`Error fetching transaction ${transactionId}:`, error);
      throw error;
    }
  }

  async getLatestTransactionPrice(tokenId: number): Promise<number | null> {
    try {
      const [latestTransaction] = await this.db
        .select({ price_in_usd: transactions.price_in_usd })
        .from(transactions)
        .where(eq(transactions.token_id, tokenId))
        .orderBy(desc(transactions.created_at))
        .limit(1);

      return latestTransaction ? parseFloat(latestTransaction.price_in_usd) : null;
    } catch (error) {
      console.error(`Error fetching the latest transaction price for token ${tokenId}:`, error);
      return null;
    }
  }

  async getNetInvestmentForStrategy(strategyId: number): Promise<number> {
    const result = await this.db
      .select({
        netInvestment: sql`SUM(CASE 
          WHEN type = 'buy' THEN amount_ton::numeric 
          WHEN type = 'sell' THEN -amount_ton::numeric 
          ELSE 0 
        END)`,
      })
      .from(transactions)
      .where(eq(transactions.strategy_id, strategyId));

    return Number(result[0].netInvestment) || 0;
  }

  async getPendingTransactions(): Promise<Transaction[]> {
    try {
      const pendingTransactions = await this.db
        .select()
        .from(transactions)
        .where(eq(transactions.status, TransactionStatus.Pending));

      return pendingTransactions.map((transaction) => ({
        ...transaction,
        type: transaction.type as TransactionType,
        dex: transaction.dex as Dex,
        status: transaction.status as TransactionStatus,
      }));
    } catch (error) {
      console.error('Error fetching pending transactions:', error);
      throw error;
    }
  }

  async hasPendingTransaction(
    userId: number,
    tokenId: number,
    strategyId: number,
  ): Promise<boolean> {
    try {
      const [result] = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(
          and(
            eq(transactions.user_id, userId),
            eq(transactions.token_id, tokenId),
            eq(transactions.strategy_id, strategyId),
            eq(transactions.status, TransactionStatus.Pending),
          ),
        );

      return result.count > 0;
    } catch (error) {
      console.error(
        `Error checking pending transactions for user ${userId}, token ${tokenId}, and strategy ${strategyId}:`,
        error,
      );
      throw error;
    }
  }

  async calculatePNL(strategyId: number): Promise<{ pnlUSD: number; pnlTON: number }> {
    const result = await this.db
      .select({
        pnlUSD: sql`SUM(CASE 
          WHEN type = 'sell' THEN amount_ton::numeric * price_in_usd::numeric
          WHEN type = 'buy' THEN -amount_ton::numeric * price_in_usd::numeric
          ELSE 0 
        END)`,
        pnlTON: sql`SUM(CASE 
          WHEN type = 'sell' THEN amount_ton::numeric
          WHEN type = 'buy' THEN -amount_ton::numeric
          ELSE 0 
        END)`,
      })
      .from(transactions)
      .where(eq(transactions.strategy_id, strategyId));

    return {
      pnlUSD: Number(result[0].pnlUSD) || 0,
      pnlTON: Number(result[0].pnlTON) || 0,
    };
  }

  async getPendingInvestmentForStrategy(strategyId: number): Promise<number> {
    const result = await this.db
      .select({
        pendingInvestment: sql`SUM(CASE 
          WHEN type = 'buy' AND status = 'pending' THEN amount_ton::numeric 
          ELSE 0 
        END)`,
      })
      .from(transactions)
      .where(eq(transactions.strategy_id, strategyId));

    return Number(result[0].pendingInvestment) || 0;
  }
}
