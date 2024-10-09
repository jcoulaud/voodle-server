import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import BigNumber from 'bignumber.js';
import { fromUnixTime } from 'date-fns';
import cron from 'node-cron';
import {
  API_MAX_RETRIES,
  CRON_SCHEDULE,
  DECIMALS,
  DEDUST_API_URL,
  STONFI_API_URL,
  TON_ADDRESS,
  TON_SYMBOL,
  TON_USDT_ADDRESS,
} from 'src/constants';
import { logger, normalizeTokenAmount } from 'src/helpers';
import { DeDustPool, Dex, PoolData, StonFiPool } from 'src/types';
import { PoolService } from '../db/pool.service';
import { TokenService } from '../db/token.service';
import { TonApiService } from '../integrations/ton-api.service';

@Injectable()
export class PoolManager {
  private api: AxiosInstance;
  private isMonitoring = false;
  private knownPools = new Set<string>();
  private tonPriceInUSD: number | null = null;
  private stonFiFailureCount = 0;
  private readonly MAX_STONFI_FAILURES = 5;

  constructor(
    @Inject(TonApiService) private readonly tonApiService: TonApiService,
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(PoolService) private readonly poolService: PoolService,
    @Inject(HttpService) private readonly httpService: HttpService,
  ) {}

  async onModuleInit() {
    this.initializeAxios();
    await this.initializeKnownPools();
  }

  private initializeAxios() {
    if (!this.httpService) {
      throw new Error('HttpService is not initialized in PoolManager.');
    }
    this.api = this.httpService.axiosRef;
    axiosRetry(this.api, {
      retries: API_MAX_RETRIES,
      retryDelay: axiosRetry.exponentialDelay,
      onRetry: (retryCount, error) => {
        const errorMessage = `API call failed. Retry attempt: ${retryCount}/${API_MAX_RETRIES}. Host: ${error.config?.url}, Message: ${error.message}`;
        logger.warning(errorMessage);
      },
    });
  }

  // --------------------------------------------------------------
  // -------------------- Pool Monitoring -------------------------
  // --------------------------------------------------------------

  public startMonitoring(): void {
    cron.schedule(CRON_SCHEDULE, this.monitoringCycle.bind(this));
  }

  private async monitoringCycle(): Promise<void> {
    if (this.isMonitoring) {
      return;
    }

    const startTime = Date.now();
    this.isMonitoring = true;

    try {
      logger.info('Starting pool monitoring cycle');
      await this.fetchTONPrice();
      const [deDustPools, stonFiPools] = await this.fetchAllPools();

      const newDeDustTokens = await this.processNewPools(deDustPools, Dex.DeDust);
      const newStonFiTokens = await this.processNewPools(stonFiPools, Dex.StonFi);
      const newTokensCount = newDeDustTokens + newStonFiTokens;

      const updatedPoolsCount = await this.updateAllPools(deDustPools, stonFiPools);

      logger.info(`Added ${newTokensCount} new tokens and updated ${updatedPoolsCount} pools`);
    } catch (error) {
      logger.error(`Error during pool monitoring: ${error}`);
    } finally {
      this.isMonitoring = false;
      const duration = (Date.now() - startTime) / 1000;
      logger.info(`Pool monitoring cycle completed in ${duration} seconds`);
    }
  }

  // --------------------------------------------------------------
  // ---------------------- Pool Fetching -------------------------
  // --------------------------------------------------------------

  private async fetchAllPools(): Promise<[DeDustPool[], StonFiPool[]]> {
    const [deDustPools, stonFiPools] = await Promise.all([
      this.fetchDeDustPools(),
      this.fetchStonFiPools(),
    ]);
    logger.info(
      `Fetched ${deDustPools.length} DeDust pools and ${stonFiPools.length} StonFi pools`,
    );
    return [deDustPools, stonFiPools];
  }

  private async fetchDeDustPools(): Promise<DeDustPool[]> {
    try {
      const { data } = await this.api.get<DeDustPool[]>(`${DEDUST_API_URL}/v2/pools`);
      return data;
    } catch (error) {
      return [];
    }
  }

  private async fetchStonFiPools(): Promise<StonFiPool[]> {
    if (this.stonFiFailureCount >= this.MAX_STONFI_FAILURES) {
      logger.info('StonFi API calls disabled due to repeated failures');
      return [];
    }

    try {
      const { data } = await this.api.get<{ pool_list: StonFiPool[] }>(
        `${STONFI_API_URL}/v1/pools`,
      );
      this.stonFiFailureCount = 0;
      return data.pool_list;
    } catch (error) {
      this.handleStonFiError(error);
      return [];
    }
  }

  private handleStonFiError(error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        logger.error('StonFi API request timed out after retries');
      } else {
        logger.error(`StonFi API request failed after retries: ${error.message}`);
      }
    } else {
      logger.error(`Unexpected error fetching StonFi pools: ${error}`);
    }
    this.stonFiFailureCount++;
  }

  private async fetchTONPrice(): Promise<void> {
    this.tonPriceInUSD = await this.tonApiService.fetchTokenPriceInUSD(TON_SYMBOL);
    if (!this.tonPriceInUSD) {
      throw new Error('Failed to fetch TON price in USD');
    }
  }

  // --------------------------------------------------------------
  // --------------------- Data Processing ------------------------
  // --------------------------------------------------------------

  private getReserves(pool: DeDustPool | StonFiPool, dex: Dex): [string, string] {
    if (dex === Dex.DeDust) {
      const deDustPool = pool as DeDustPool;
      return [deDustPool.reserves[0], deDustPool.reserves[1]];
    } else {
      const stonFiPool = pool as StonFiPool;
      const nativeReserve =
        stonFiPool.token0_address === TON_ADDRESS || stonFiPool.token0_address === TON_USDT_ADDRESS
          ? stonFiPool.reserve0
          : stonFiPool.reserve1;
      const tokenReserve =
        stonFiPool.token0_address === TON_ADDRESS || stonFiPool.token0_address === TON_USDT_ADDRESS
          ? stonFiPool.reserve1
          : stonFiPool.reserve0;
      return [nativeReserve, tokenReserve];
    }
  }

  private createPoolData(
    poolAddress: string,
    dex: Dex,
    nativeReserve: string,
    tokenReserve: string,
    tokenDecimals: number,
    totalSupply: string,
  ): PoolData {
    if (this.tonPriceInUSD === null) {
      throw new Error('TON price in USD is not set');
    }

    const humanNativeReserve = normalizeTokenAmount(nativeReserve, DECIMALS);
    const humanTokenReserve = normalizeTokenAmount(tokenReserve, tokenDecimals);

    const tokenPriceInTon = new BigNumber(nativeReserve).dividedBy(tokenReserve);
    const tokenPriceInUSD = tokenPriceInTon.multipliedBy(this.tonPriceInUSD);
    const totalLiquidityInUsd = humanNativeReserve.multipliedBy(this.tonPriceInUSD).multipliedBy(2);
    const marketCapInUsd = tokenPriceInUSD.multipliedBy(
      normalizeTokenAmount(totalSupply, tokenDecimals),
    );

    return {
      poolAddress,
      dex,
      nativeLiquidity: humanNativeReserve.toFixed(DECIMALS),
      assetLiquidity: humanTokenReserve.toFixed(tokenDecimals),
      totalLiquidityInUsd: totalLiquidityInUsd.toFixed(2),
      priceInTon: tokenPriceInTon.toFixed(9),
      priceInUsd: tokenPriceInUSD.toFixed(6),
      marketCapInUsd: marketCapInUsd.toFixed(2),
    };
  }

  private getTokenAddressFromPool(pool: DeDustPool | StonFiPool, dex: Dex): string {
    if (dex === Dex.DeDust) {
      const jettonAsset = (pool as DeDustPool).assets.find((asset) => asset.type === 'jetton');
      return jettonAsset?.address || '';
    } else {
      const stonFiPool = pool as StonFiPool;
      return stonFiPool.token0_address === TON_ADDRESS ||
        stonFiPool.token0_address === TON_USDT_ADDRESS
        ? stonFiPool.token1_address
        : stonFiPool.token0_address;
    }
  }

  // --------------------------------------------------------------
  // ------------------------ Core logic --------------------------
  // --------------------------------------------------------------

  private async processNewPool(
    poolAddress: string,
    tokenAddress: string,
    dex: Dex,
    nativeReserve: string,
    tokenReserve: string,
  ): Promise<void> {
    let token = await this.tokenService.getTokenByAddress(tokenAddress);

    if (!token) {
      const tokenMetadata = await this.tonApiService.fetchTokenMetadata(tokenAddress);
      if (!tokenMetadata) {
        return;
      }

      const tokenTransactions = await this.tonApiService.getAccountTransactions(
        tokenAddress,
        1,
        'asc',
      );
      if (!tokenTransactions || tokenTransactions.length === 0) {
        logger.error(`Failed to fetch transactions for token: ${tokenAddress}`);
        return;
      }
      const tokenCreationDate = fromUnixTime(tokenTransactions[0].utime);

      const { metadata, total_supply } = tokenMetadata;

      token = await this.tokenService.createToken({
        rawAddress: metadata.address,
        friendlyAddress: tokenAddress,
        metadata,
        totalSupply: total_supply,
        createdAt: tokenCreationDate,
      });

      if (!token) {
        logger.error(`Failed to create token for ${tokenAddress}`);
        return;
      }

      logger.success(`New token created: $${token.metadata.symbol} (${tokenAddress})`);
    }

    const poolData: PoolData = this.createPoolData(
      poolAddress,
      dex,
      nativeReserve,
      tokenReserve,
      Number(token.metadata.decimals),
      token.total_supply,
    );

    const updatedToken = await this.poolService.updateTokenPoolData(token, poolData);

    if (updatedToken) {
      logger.success(`Pool data updated for ${token.metadata.symbol} on ${dex}!`);
    } else {
      logger.error(`Failed to update pool data for $${token.metadata.symbol} on ${dex}`);
    }
  }

  private async processNewPools(pools: (DeDustPool | StonFiPool)[], dex: Dex): Promise<number> {
    let newTokensCount = 0;
    for (const pool of pools) {
      const tokenAddress = this.getTokenAddressFromPool(pool, dex);
      if (!(await this.tokenService.getTokenByAddress(tokenAddress))) {
        const [nativeReserve, tokenReserve] = this.getReserves(pool, dex);
        await this.processNewPool(pool.address, tokenAddress, dex, nativeReserve, tokenReserve);
        newTokensCount++;
      }
    }
    return newTokensCount;
  }

  private async updateAllPools(
    deDustPools: DeDustPool[],
    stonFiPools: StonFiPool[],
  ): Promise<number> {
    const allTokens = await this.tokenService.getAllTokens();
    let updatedPoolsCount = 0;

    for (const token of allTokens) {
      for (const pool of token.dexInfo) {
        const currentPool =
          pool.dex === Dex.DeDust
            ? deDustPools.find((p) => p.address === pool.pool_address)
            : stonFiPools.find((p) => p.address === pool.pool_address);

        if (currentPool) {
          const [nativeReserve, tokenReserve] = this.getReserves(currentPool, pool.dex);
          const updatedPoolData = this.createPoolData(
            pool.pool_address,
            pool.dex,
            nativeReserve,
            tokenReserve,
            Number(token.metadata.decimals),
            token.total_supply,
          );
          await this.poolService.updateTokenPoolData(token, updatedPoolData);
          updatedPoolsCount++;
        }
      }
    }

    return updatedPoolsCount;
  }

  // --------------------------------------------------------------
  // -------------------- Helper Functions ------------------------
  // --------------------------------------------------------------

  private async initializeKnownPools(): Promise<void> {
    const existingTokens = await this.tokenService.getAllTokens();
    existingTokens.forEach((token) => {
      token.dexInfo.forEach((pool) => {
        this.knownPools.add(pool.pool_address);
      });
    });
    logger.info(`Initialized with ${this.knownPools.size} known pools`);
  }
}
