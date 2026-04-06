ALTER TABLE "organisations" ADD COLUMN "platform_fee_bps" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "stripe_checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "platform_fee_cents" integer;