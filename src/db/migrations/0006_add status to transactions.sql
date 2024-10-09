DO $$ BEGIN
 CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'success', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "status" "transaction_status" NOT NULL;