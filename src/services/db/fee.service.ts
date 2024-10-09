import { fees } from '@/db/schema';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class FeeService {
  constructor(@Inject('DATABASE_CONNECTION') private db: NodePgDatabase) {}

  async createFee(feeData: {
    user_id: number;
    amount_ton: string;
    transaction_id: number;
  }): Promise<number> {
    try {
      const [result] = await this.db.insert(fees).values(feeData).returning({ id: fees.id });
      return result.id;
    } catch (error) {
      console.error(`Error creating fee:`, error);
      throw error;
    }
  }

  async getFeeByTransactionId(transactionId: number): Promise<{ amount_ton: string } | null> {
    try {
      const [fee] = await this.db
        .select({ amount_ton: fees.amount_ton })
        .from(fees)
        .where(eq(fees.transaction_id, transactionId))
        .limit(1);

      return fee || null;
    } catch (error) {
      console.error(`Error fetching fee for transaction ${transactionId}:`, error);
      throw error;
    }
  }
}
