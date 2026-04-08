ALTER TABLE "bookings" ADD COLUMN "gst_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "checkout_line_items" ADD COLUMN "gst_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "one_off_charges" ADD COLUMN "gst_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "gst_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "gst_rate_bps" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "abn_number" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "gst_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "gst_amount_cents" integer DEFAULT 0 NOT NULL;