ALTER TABLE "transaction" ADD COLUMN "transaction_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_transaction_transaction_id" ON "transaction" USING btree ("transaction_id");