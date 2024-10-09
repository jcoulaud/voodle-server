import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pools } from '../../db/schema';
import { PoolData, Token } from '../../types';
import { TokenService } from './token.service';

@Injectable()
export class PoolService {
  constructor(
    @Inject('DATABASE_CONNECTION') private db: NodePgDatabase,
    @Inject(TokenService) private tokenService: TokenService,
  ) {}

  async updateTokenPoolData(token: Token, poolData: PoolData): Promise<Token | null> {
    try {
      await this.db
        .insert(pools)
        .values({
          token_id: token.id,
          pool_address: poolData.poolAddress,
          dex: poolData.dex,
          native_liquidity: poolData.nativeLiquidity,
          asset_liquidity: poolData.assetLiquidity,
          total_liquidity_in_usd: poolData.totalLiquidityInUsd,
          market_cap_in_usd: poolData.marketCapInUsd,
          price_in_ton: poolData.priceInTon,
          price_in_usd: poolData.priceInUsd,
          updated_at: new Date(),
        })
        .onConflictDoUpdate({
          target: [pools.token_id, pools.dex],
          set: {
            native_liquidity: poolData.nativeLiquidity,
            asset_liquidity: poolData.assetLiquidity,
            total_liquidity_in_usd: poolData.totalLiquidityInUsd,
            market_cap_in_usd: poolData.marketCapInUsd,
            price_in_ton: poolData.priceInTon,
            price_in_usd: poolData.priceInUsd,
            updated_at: new Date(),
          },
        });

      return await this.tokenService.getTokenByAddress(token.friendly_address);
    } catch (error) {
      console.error(`Error updating DEX info for token ${token.friendly_address}:`, error);
      return null;
    }
  }
}
