export interface StrategyLogic {
  buy?: {
    conditions: BuyCondition[];
    action: BuyAction;
  };
  sell?: SellStrategy[];
}

export type BuyCondition =
  | TokenNameCondition
  | MarketCapCondition
  | LiquidityCondition
  | PriceCondition
  | AgeCondition
  | BlacklistCondition;

export interface TokenNameCondition {
  type: 'tokenName';
  operator: 'contains';
  value: string;
}

export interface MarketCapCondition {
  type: 'marketCap';
  operator: 'greaterThan' | 'lessThan' | 'between';
  value: number | [number, number];
}

export interface LiquidityCondition {
  type: 'liquidity';
  operator: 'greaterThan' | 'lessThan' | 'between';
  value: number | [number, number];
}

export interface PriceCondition {
  type: 'price';
  operator: 'greaterThan' | 'lessThan' | 'between';
  value: number | [number, number];
}

export interface AgeCondition {
  type: 'age';
  days: number;
  operator: 'greaterThan' | 'lessThan' | 'equal';
}

export interface BlacklistCondition {
  type: 'blacklist';
  checkDollarSign: boolean;
  checkBlacklist: boolean;
}

export interface BuyAction {
  type: 'fixedAmount';
  amount: number;
}

export interface SellStrategy {
  condition: SellCondition;
  action: SellAction;
}

export interface SellCondition {
  type: 'price';
  operator: 'increasedBy' | 'decreasedBy';
  value: number;
}

export interface SellAction {
  type: 'percentageOfHoldings';
  amount: number;
}

export interface UserStrategy {
  id: number;
  name: string;
  userId: number;
  isActive: boolean;
  strategyLogic: StrategyLogic;
  maxBetAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenEvaluation {
  tokenId: number;
  strategyId: number;
  userId: number;
}
