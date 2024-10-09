import {
  boolean,
  index,
  integer,
  json,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// -------------------- Enums --------------------

export const statusEnum = pgEnum('status', [
  'monitored',
  'bought',
  'sold',
  'dropped',
  'partially_sold',
]);

export const dexEnum = pgEnum('dex', ['dedust', 'stonfi']);

export const transactionTypeEnum = pgEnum('transaction_type', ['buy', 'sell']);

export const transactionStatusEnum = pgEnum('transaction_status', ['pending', 'success', 'failed']);

export const verificationTokenStatusEnum = pgEnum('verification_token_status', [
  'active',
  'used',
  'expired',
]);

export const blockchainEnum = pgEnum('blockchain', ['ton']);

// -------------------- Tables --------------------

export const users = pgTable('user', {
  id: serial('id').primaryKey(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
  username: text('username').notNull().unique(),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
});

export const wallets = pgTable('wallet', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id')
    .notNull()
    .references(() => users.id),
  blockchain: blockchainEnum('blockchain').notNull(),
  address: text('address').notNull().unique(),
  private_key: text('private_key').notNull(),
  created_at: timestamp('created_at').defaultNow(),
});

export const strategies = pgTable('strategy', {
  id: serial('id').primaryKey(),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
  user_id: integer('user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  is_active: boolean('is_active').notNull().default(true),
  strategy: json('strategy').notNull(),
  max_bet_amount: numeric('max_bet_amount').notNull(),
});

export const tokens = pgTable(
  'token',
  {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at').defaultNow(),
    raw_address: text('raw_address').notNull().unique(),
    friendly_address: text('friendly_address').notNull().unique(),
    metadata: json('metadata').notNull(),
    total_supply: numeric('total_supply').notNull(),
  },
  (table) => ({
    friendlyAddressIdx: index('idx_token_friendly_address').on(table.friendly_address),
  }),
);

export const pools = pgTable(
  'pool',
  {
    id: serial('id').primaryKey(),
    token_id: integer('token_id')
      .notNull()
      .references(() => tokens.id),
    dex: dexEnum('dex').notNull(),
    pool_address: text('pool_address').notNull(),
    native_liquidity: numeric('native_liquidity'),
    asset_liquidity: numeric('asset_liquidity'),
    total_liquidity_in_usd: numeric('total_liquidity_in_usd'),
    price_in_ton: numeric('price_in_ton'),
    price_in_usd: numeric('price_in_usd'),
    market_cap_in_usd: numeric('market_cap_in_usd'),
    updated_at: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    tokenDexInfoUnique: uniqueIndex('token_pool_unique').on(table.token_id, table.dex),
    updatedAtIdx: index('idx_pool_updated_at').on(table.updated_at),
  }),
);

export const transactions = pgTable(
  'transaction',
  {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at').defaultNow(),
    token_id: integer('token_id')
      .notNull()
      .references(() => tokens.id),
    strategy_id: integer('strategy_id')
      .notNull()
      .references(() => strategies.id),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id),
    type: transactionTypeEnum('type').notNull(),
    amount_token: numeric('amount_token').notNull(),
    amount_ton: numeric('amount_ton').notNull(),
    price_in_usd: numeric('price_in_usd').notNull(),
    dex: dexEnum('dex'),
    status: transactionStatusEnum('status').notNull(),
    transaction_id: text('transaction_id'),
  },
  (table) => ({
    tokenIdCreatedAtIdx: index('idx_transaction_token_id_created_at').on(
      table.token_id,
      table.created_at,
    ),
    strategyIdCreatedAtIdx: index('idx_transaction_strategy_id_created_at').on(
      table.strategy_id,
      table.created_at,
    ),
    userIdCreatedAtIdx: index('idx_transaction_user_id_created_at').on(
      table.user_id,
      table.created_at,
    ),
    typeCreatedAtIdx: index('idx_transaction_type_created_at').on(table.type, table.created_at),
    transactionIdIdx: index('idx_transaction_transaction_id').on(table.transaction_id),
  }),
);

export const fees = pgTable(
  'fee',
  {
    id: serial('id').primaryKey(),
    created_at: timestamp('created_at').defaultNow(),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id),
    amount_ton: numeric('amount_ton').notNull(),
    transaction_id: integer('transaction_id')
      .notNull()
      .references(() => transactions.id),
  },
  (table) => ({
    userIdCreatedAtIdx: index('idx_fee_user_id_created_at').on(table.user_id, table.created_at),
    transactionIdIdx: index('idx_fee_transaction_id').on(table.transaction_id),
  }),
);

export const tokenBalances = pgTable(
  'token_balance',
  {
    id: serial('id').primaryKey(),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id),
    token_id: integer('token_id')
      .notNull()
      .references(() => tokens.id),
    balance: numeric('balance').notNull(),
    updated_at: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userTokenUniqueIdx: uniqueIndex('user_token_unique').on(table.user_id, table.token_id),
  }),
);

export const verificationTokens = pgTable(
  'verification_token',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
    status: verificationTokenStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (table) => ({
    identifierTokenIndex: uniqueIndex('verification_token_identifier_token_key').on(
      table.identifier,
      table.token,
    ),
  }),
);

export const refreshTokens = pgTable('refresh_token', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  token: text('token').notNull().unique(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
