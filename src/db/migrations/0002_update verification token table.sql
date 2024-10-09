DO $$ BEGIN
 CREATE TYPE "public"."verification_token_status" AS ENUM('active', 'used', 'expired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "verification_token" DROP CONSTRAINT "verification_token_token_unique";--> statement-breakpoint
ALTER TABLE "verification_token" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_token" ADD COLUMN "status" "verification_token_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_token" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;