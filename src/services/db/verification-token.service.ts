import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { verificationTokens } from '../../db/schema';

@Injectable()
export class VerificationTokenService {
  constructor(@Inject('DATABASE_CONNECTION') private db: NodePgDatabase) {}

  async generateVerificationToken(email: string, token: string, expires: Date): Promise<void> {
    try {
      await this.db.transaction(async (trx) => {
        // Expire all active tokens of the same type for this identifier
        await trx
          .update(verificationTokens)
          .set({ status: 'expired' })
          .where(
            and(eq(verificationTokens.identifier, email), eq(verificationTokens.status, 'active')),
          );

        // Insert the new token
        await trx.insert(verificationTokens).values({
          identifier: email,
          token,
          expires,
          status: 'active',
        });
      });
    } catch (error) {
      console.error(`Error generating verification token:`, error);
      throw error;
    }
  }

  async validateAndUpdateToken(identifier: string, token: string): Promise<boolean> {
    const now = new Date();

    const result = await this.db
      .update(verificationTokens)
      .set({ status: 'used' })
      .where(
        and(
          eq(verificationTokens.identifier, identifier),
          eq(verificationTokens.token, token),
          eq(verificationTokens.status, 'active'),
          gt(verificationTokens.expires, now),
        ),
      )
      .returning();

    return result.length > 0;
  }

  // TODO: Add a cron job to run this every day
  async cleanupExpiredTokens(): Promise<void> {
    await this.db
      .delete(verificationTokens)
      .where(
        and(
          sql`${verificationTokens.expires} < NOW()`,
          sql`${verificationTokens.createdAt} < NOW() - INTERVAL '1 month'`,
        ),
      );
  }
}
