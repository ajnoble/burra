ALTER TABLE "membership_classes" ADD COLUMN "annual_fee_cents" integer;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "subscription_grace_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "reminder_sent_at" timestamp with time zone;