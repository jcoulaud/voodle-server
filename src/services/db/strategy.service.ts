import { strategies } from '@/db/schema';
import { CreateStrategyInput } from '@/graphql/strategy/dto/create-strategy.input';
import { EditStrategyInput } from '@/graphql/strategy/dto/edit-strategy.input';
import { Strategy } from '@/graphql/strategy/models/strategy.model';
import { StrategyLogic, UserStrategy } from '@/types/strategy.types';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { TransactionService } from './transaction.service';

@Injectable()
export class StrategyService {
  constructor(
    @Inject('DATABASE_CONNECTION') private db: NodePgDatabase,
    @Inject(TransactionService) private readonly transactionService: TransactionService,
  ) {}

  private async mapStrategyWithPNL(strategy: UserStrategy): Promise<Strategy> {
    const { pnlUSD, pnlTON } = await this.transactionService.calculatePNL(strategy.id);
    return {
      ...strategy,
      pnlUSD,
      pnlTON,
    };
  }

  async createStrategy(
    createStrategyInput: CreateStrategyInput,
    userId: number,
  ): Promise<Strategy> {
    try {
      const [newStrategy] = await this.db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(strategies)
          .values({
            name: createStrategyInput.name,
            strategy: createStrategyInput.strategy,
            user_id: userId,
            max_bet_amount: createStrategyInput.maxBetAmount.toString(),
          })
          .returning();
        return [inserted];
      });

      return this.mapStrategyWithPNL({
        id: newStrategy.id,
        name: newStrategy.name,
        strategyLogic: newStrategy.strategy as StrategyLogic,
        userId: newStrategy.user_id,
        isActive: newStrategy.is_active,
        maxBetAmount: Number(newStrategy.max_bet_amount),
        createdAt: newStrategy.created_at,
        updatedAt: newStrategy.updated_at,
      });
    } catch (error) {
      console.error('Error creating strategy:', error);
      throw new Error('Failed to create strategy');
    }
  }

  async editStrategy(editStrategyInput: EditStrategyInput, userId: number): Promise<Strategy> {
    try {
      const [updatedStrategy] = await this.db.transaction(async (tx) => {
        const [strategy] = await tx
          .select()
          .from(strategies)
          .where(and(eq(strategies.id, editStrategyInput.id), eq(strategies.user_id, userId)))
          .limit(1);

        if (!strategy) {
          throw new NotFoundException('Strategy not found or user does not have permission');
        }

        const [updated] = await tx
          .update(strategies)
          .set({
            name: editStrategyInput.name ?? strategy.name,
            is_active: editStrategyInput.isActive ?? strategy.is_active,
            max_bet_amount: editStrategyInput.maxBetAmount
              ? editStrategyInput.maxBetAmount.toString()
              : strategy.max_bet_amount,
          })
          .where(eq(strategies.id, editStrategyInput.id))
          .returning();

        return [updated];
      });

      return this.mapStrategyWithPNL({
        id: updatedStrategy.id,
        name: updatedStrategy.name,
        strategyLogic: updatedStrategy.strategy as StrategyLogic,
        userId: updatedStrategy.user_id,
        isActive: updatedStrategy.is_active,
        maxBetAmount: Number(updatedStrategy.max_bet_amount),
        createdAt: updatedStrategy.created_at,
        updatedAt: updatedStrategy.updated_at,
      });
    } catch (error) {
      console.error('Error editing strategy:', error);
      throw error;
    }
  }

  async getAllActiveStrategies(): Promise<UserStrategy[]> {
    try {
      const result = await this.db.select().from(strategies).where(eq(strategies.is_active, true));

      return result.map((strategy) => ({
        id: strategy.id,
        userId: strategy.user_id,
        strategyLogic: strategy.strategy as StrategyLogic,
        name: strategy.name,
        isActive: strategy.is_active,
        createdAt: strategy.created_at,
        updatedAt: strategy.updated_at,
        maxBetAmount: Number(strategy.max_bet_amount),
      }));
    } catch (error) {
      console.error('Error fetching active strategies:', error);
      return [];
    }
  }

  async getStrategyById(id: number): Promise<UserStrategy | null> {
    try {
      const [strategy] = await this.db
        .select()
        .from(strategies)
        .where(eq(strategies.id, id))
        .limit(1);

      if (!strategy) return null;

      return {
        id: strategy.id,
        userId: strategy.user_id,
        name: strategy.name,
        isActive: strategy.is_active,
        strategyLogic: strategy.strategy as StrategyLogic,
        createdAt: strategy.created_at,
        updatedAt: strategy.updated_at,
        maxBetAmount: Number(strategy.max_bet_amount),
      };
    } catch (error) {
      console.error(`Error fetching strategy by id ${id}:`, error);
      throw error;
    }
  }

  async getStrategiesByUserId(userId: number): Promise<UserStrategy[]> {
    try {
      const result = await this.db.select().from(strategies).where(eq(strategies.user_id, userId));

      return result.map((strategy) => ({
        id: strategy.id,
        userId: strategy.user_id,
        name: strategy.name,
        isActive: strategy.is_active,
        strategyLogic: strategy.strategy as StrategyLogic,
        createdAt: strategy.created_at,
        updatedAt: strategy.updated_at,
        maxBetAmount: Number(strategy.max_bet_amount),
      }));
    } catch (error) {
      console.error(`Error fetching strategies for user ${userId}:`, error);
      throw error;
    }
  }

  async getStrategyWithPNL(id: number): Promise<Strategy & { pnlUSD: number; pnlTON: number }> {
    const strategy = await this.getStrategyById(id);
    const { pnlUSD, pnlTON } = await this.transactionService.calculatePNL(id);
    return { ...strategy, pnlUSD, pnlTON };
  }
}
