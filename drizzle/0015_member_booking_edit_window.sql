ALTER TABLE "organisations" ADD COLUMN "member_booking_edit_window_days" integer NOT NULL DEFAULT 0;
ALTER TABLE "organisations" ADD COLUMN "member_edit_requires_approval" boolean NOT NULL DEFAULT false;
