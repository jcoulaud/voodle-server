DO $$ BEGIN
 CREATE TYPE "public"."dex" AS ENUM('dedust', 'stonfi');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."status" AS ENUM('monitored', 'bought', 'sold', 'dropped', 'partially_sold');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."transaction_type" AS ENUM('buy', 'sell');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pool" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_id" integer NOT NULL,
	"dex" "dex" NOT NULL,
	"pool_address" text NOT NULL,
	"native_liquidity" numeric,
	"asset_liquidity" numeric,
	"total_liquidity_in_usd" numeric,
	"price_in_ton" numeric,
	"price_in_usd" numeric,
	"market_cap_in_usd" numeric,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "strategy" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"strategy" json NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "token_balance" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_id" integer NOT NULL,
	"balance" numeric NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "token" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"raw_address" text NOT NULL,
	"friendly_address" text NOT NULL,
	"metadata" json NOT NULL,
	"total_supply" numeric NOT NULL,
	CONSTRAINT "token_raw_address_unique" UNIQUE("raw_address"),
	CONSTRAINT "token_friendly_address_unique" UNIQUE("friendly_address")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"token_id" integer NOT NULL,
	"strategy_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount_token" numeric NOT NULL,
	"amount_ton" numeric NOT NULL,
	"price_in_usd" numeric NOT NULL,
	"dex" "dex"
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"username" text NOT NULL,
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pool" ADD CONSTRAINT "pool_token_id_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."token"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "strategy" ADD CONSTRAINT "strategy_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "token_balance" ADD CONSTRAINT "token_balance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "token_balance" ADD CONSTRAINT "token_balance_token_id_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."token"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transaction" ADD CONSTRAINT "transaction_token_id_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."token"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transaction" ADD CONSTRAINT "transaction_strategy_id_strategy_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategy"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transaction" ADD CONSTRAINT "transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "token_pool_unique" ON "pool" USING btree ("token_id","dex");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pool_updated_at" ON "pool" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_token_unique" ON "token_balance" USING btree ("user_id","token_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_token_friendly_address" ON "token" USING btree ("friendly_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transaction_token_id_created_at" ON "transaction" USING btree ("token_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transaction_strategy_id_created_at" ON "transaction" USING btree ("strategy_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transaction_user_id_created_at" ON "transaction" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transaction_type_created_at" ON "transaction" USING btree ("type","created_at");