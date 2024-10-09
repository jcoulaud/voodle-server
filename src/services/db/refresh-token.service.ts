import { refreshTokens } from '@/db/schema';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class RefreshTokenService {
  constructor(@Inject('DATABASE_CONNECTION') private db: NodePgDatabase) {}

  async createRefreshToken(userId: number, token: string, expiresIn: number): Promise<void> {
    const expires = new Date(Date.now() + expiresIn * 1000);
    await this.db.insert(refreshTokens).values({
      userId,
      token,
      expires,
    });
  }

  async findRefreshToken(token: string) {
    const result = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, token))
      .limit(1);
    return result[0];
  }

  async deleteRefreshToken(token: string): Promise<void> {
    await this.db.delete(refreshTokens).where(eq(refreshTokens.token, token));
  }

  async deleteAllUserRefreshTokens(userId: number): Promise<void> {
    await this.db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  }
}
