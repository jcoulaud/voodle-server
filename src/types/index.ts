import BigNumber from 'bignumber.js';

export enum Status {
  Monitored = 'monitored',
  Bought = 'bought',
  PartiallySold = 'partially_sold',
  Sold = 'sold',
  Dropped = 'dropped',
}

export enum TransactionType {
  Buy = 'buy',
  Sell = 'sell',
}

export enum SellType {
  All = 'all',
  Half = 'half',
}

export interface Pool {
  dex: Dex;
  pool_address: string;
  native_liquidity: string | null;
  asset_liquidity: string | null;
  total_liquidity_in_usd: string | null;
  price_in_ton: string | null;
  price_in_usd: string | null;
  market_cap_in_usd: string | null;
}

export interface Token {
  id: number;
  raw_address: string;
  friendly_address: string;
  metadata: Metadata;
  total_supply: string;
  created_at: Date | null;
  dexInfo: Pool[];
}

export interface Metadata {
  address: string;
  name: string;
  symbol: string;
  decimals: string;
  image: string;
  description: string;
}

export interface User {
  id: number;
  username: string;
  createdAt: Date;
  updatedAt: Date;
  email: string;
  emailVerified: Date;
}

export interface TokenMetadata {
  total_supply: string;
  metadata: Metadata;
}

export interface AccountEvent {
  event_id: string;
  account: {
    address: string;
    is_scam: boolean;
    is_wallet: boolean;
  };
  timestamp: number;
  actions: Array<{
    type: 'TonTransfer' | 'JettonTransfer' | 'SmartContractExec' | 'JettonSwap' | 'JettonMint';
    status: string;
    JettonTransfer?: {
      sender: {
        address: string;
      };
      recipient: {
        address: string;
      };
      amount: string;
      jetton: {
        address: string;
        symbol: string;
      };
    };
    TonTransfer?: {
      sender: {
        address: string;
      };
      recipient: {
        address: string;
      };
      amount: number;
    };
    SmartContractExec?: {
      executor: {
        address: string;
      };
      operation: 'StonfiSwap' | 'DedustSwapExternal' | 'DedustPayoutFromPool';
      payload: string;
    };
    JettonSwap?: {
      dex: Dex;
      amount_in: string;
      amount_out: string;
      ton_in: number;
      ton_out: number;
      jetton_master_out?: {
        address: string;
      };
      jetton_master_in?: {
        address: string;
      };
    };
  }>;
  in_progress: boolean;
}

export interface AccountTransaction {
  hash: string;
  utime: number;
  orig_status: 'active' | 'nonexist';
  end_status: 'active';
}

export interface Trade {
  type: 'buy' | 'sell';
  tokenAmount: BigNumber;
  tonAmount: BigNumber;
}

export type PoolData = {
  poolAddress: string;
  nativeLiquidity: string;
  assetLiquidity: string;
  totalLiquidityInUsd: string;
  marketCapInUsd: string;
  priceInTon: string;
  priceInUsd: string;
  dex: Dex;
};

export enum Dex {
  DeDust = 'dedust',
  StonFi = 'stonfi',
}

export enum TransactionStatus {
  Success = 'success',
  Failed = 'failed',
  Pending = 'pending',
}

export interface TransactionResult {
  status: TransactionStatus;
  receivedAmount?: number;
}

export interface TransactionCheckResult {
  success: boolean;
  tokenAmount?: number;
  transaction_id?: string;
  currencyAmount?: number;
}

export interface DeDustPool {
  address: string;
  assets: {
    type: 'jetton' | 'native' | 'volatile';
    address?: string;
  }[];
  reserves: string[];
}

export interface StonFiPool {
  address: string;
  token0_address: string;
  token1_address: string;
  reserve0: string;
  reserve1: string;
}

export interface TonApiAccount {
  address: '0:da6b1b6663a0e4d18cc8574ccd9db5296e367dd9324706f3bbd9eb1cd2caf0bf';
  balance: number;
  last_activity: number;
  status: 'active' | 'nonexist';
  is_wallet: boolean;
  name?: string;
  is_scam?: boolean;
  is_suspended?: boolean;
}

export interface Transaction {
  id: number;
  created_at: Date;
  token_id: number;
  strategy_id: number;
  user_id: number;
  type: TransactionType;
  amount_token: string;
  amount_ton: string;
  price_in_usd: string;
  dex: Dex;
  status: TransactionStatus;
  transaction_id?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
