ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "member_booking_edit_window_days" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN IF NOT EXISTS "member_edit_requires_approval" boolean NOT NULL DEFAULT false;
