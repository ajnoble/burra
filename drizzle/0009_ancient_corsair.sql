ALTER TABLE "booking_rounds" ADD COLUMN "balance_due_date" date;--> statement-breakpoint
ALTER TABLE "booking_rounds" ADD COLUMN "payment_grace_days" integer;--> statement-breakpoint
ALTER TABLE "booking_rounds" ADD COLUMN "payment_reminder_days" jsonb;--> statement-breakpoint
ALTER TABLE "booking_rounds" ADD COLUMN "auto_cancel_refund_policy" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_reminders_sent_at" jsonb;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "booking_payment_grace_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "booking_payment_reminder_days" jsonb DEFAULT '[7,1]'::jsonb NOT NULL;