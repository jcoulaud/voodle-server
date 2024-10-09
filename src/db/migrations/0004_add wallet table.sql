DO $$ BEGIN
 CREATE TYPE "public"."blockchain" AS ENUM('ton');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"blockchain" "blockchain" NOT NULL,
	"address" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "wallet_address_unique" UNIQUE("address")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet" ADD CONSTRAINT "wallet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
