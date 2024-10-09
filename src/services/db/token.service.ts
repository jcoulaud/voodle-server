import { Inject, Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pools, tokenBalances, tokens } from '../../db/schema';
import { Dex, Metadata, Token } from '../../types';

@Injectable()
export class TokenService {
  constructor(@Inject('DATABASE_CONNECTION') private db: NodePgDatabase) {}

  async createToken(tokenData: {
    createdAt: Date;
    rawAddress: string;
    friendlyAddress: string;
    metadata: Metadata;
    totalSupply: string;
  }): Promise<Token> {
    try {
      const [createdToken] = await this.db
        .insert(tokens)
        .values({
          raw_address: tokenData.rawAddress,
          friendly_address: tokenData.friendlyAddress,
          metadata: tokenData.metadata,
          total_supply: tokenData.totalSupply,
          created_at: tokenData.createdAt,
        })
        .returning();

      const poolData = await this.db
        .select()
        .from(pools)
        .where(eq(pools.token_id, createdToken.id));

      // @ts-ignore
      const tokenWithDexInfo: Token = {
        ...createdToken,
        created_at: createdToken.created_at || null,
        dexInfo: poolData.map((pool) => ({
          dex: pool.dex as Dex,
          pool_address: pool.pool_address,
          native_liquidity: pool.native_liquidity,
          asset_liquidity: pool.asset_liquidity,
          total_liquidity_in_usd: pool.total_liquidity_in_usd,
          price_in_ton: pool.price_in_ton,
          price_in_usd: pool.price_in_usd,
          market_cap_in_usd: pool.market_cap_in_usd,
        })),
      };

      return tokenWithDexInfo;
    } catch (error) {
      console.error(`Error creating token ${tokenData.rawAddress}:`, error);
      throw error;
    }
  }

  async getTokenByAddress(address: string): Promise<Token | null> {
    try {
      const [token] = await this.db
        .select()
        .from(tokens)
        .where(eq(tokens.friendly_address, address))
        .limit(1);

      if (!token) return null;

      const dexInfos = await this.db.select().from(pools).where(eq(pools.token_id, token.id));

      return {
        ...token,
        created_at: token.created_at || null,
        dexInfo: dexInfos.map((info) => ({
          ...info,
          dex: info.dex as Dex,
        })),
      } as Token;
    } catch (error) {
      console.error(`Error fetching token by address ${address}:`, error);
      throw error;
    }
  }

  async getTokenById(id: number): Promise<Token | null> {
    try {
      const [token] = await this.db.select().from(tokens).where(eq(tokens.id, id)).limit(1);

      if (!token) return null;

      const dexInfos = await this.db.select().from(pools).where(eq(pools.token_id, token.id));

      return {
        ...token,
        created_at: token.created_at || null,
        dexInfo: dexInfos.map((info) => ({
          ...info,
          dex: info.dex as Dex,
        })),
      } as Token;
    } catch (error) {
      console.error(`Error fetching token by id ${id}:`, error);
      throw error;
    }
  }

  async getExistingTokenAddresses(): Promise<string[]> {
    try {
      const result = await this.db
        .select({ friendlyAddress: tokens.friendly_address })
        .from(tokens);
      return result.map((token) => token.friendlyAddress);
    } catch (error) {
      console.error('Error fetching existing token addresses:', error);
      return [];
    }
  }

  async getAllTokens(): Promise<Token[]> {
    try {
      const result = await this.db.select().from(tokens);

      const tokensWithDexInfo = await Promise.all(
        result.map(async (token) => {
          const dexInfos = await this.db.select().from(pools).where(eq(pools.token_id, token.id));

          return {
            ...token,
            created_at: token.created_at || null,
            dexInfo: dexInfos.map((info) => ({
              ...info,
              dex: info.dex as Dex,
            })),
          } as Token;
        }),
      );

      return tokensWithDexInfo;
    } catch (error) {
      console.error('Error fetching all tokens:', error);
      return [];
    }
  }

  async updateTokenBalance(userId: number, tokenId: number, balance: BigNumber): Promise<void> {
    try {
      await this.db
        .insert(tokenBalances)
        .values({
          user_id: userId,
          token_id: tokenId,
          balance: balance.toString(),
        })
        .onConflictDoUpdate({
          target: [tokenBalances.user_id, tokenBalances.token_id],
          set: {
            balance: balance.toString(),
            updated_at: new Date(),
          },
        });
    } catch (error) {
      console.error(`Error updating token balance:`, error);
      throw error;
    }
  }

  async getTokenBalance(userId: number, tokenId: number): Promise<BigNumber> {
    try {
      const [result] = await this.db
        .select({ balance: tokenBalances.balance })
        .from(tokenBalances)
        .where(and(eq(tokenBalances.user_id, userId), eq(tokenBalances.token_id, tokenId)))
        .limit(1);

      return result ? new BigNumber(result.balance) : new BigNumber(0);
    } catch (error) {
      console.error(
        `Error fetching token balance for user ${userId} and token ${tokenId}: ${error}`,
      );
      return new BigNumber(0);
    }
  }
}
