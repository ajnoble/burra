ALTER TYPE "public"."override_type" ADD VALUE 'EVENT';--> statement-breakpoint
ALTER TYPE "public"."transaction_type" ADD VALUE 'INVOICE';--> statement-breakpoint
CREATE TABLE "bed_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lodge_id" uuid NOT NULL,
	"bed_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"booking_round_id" uuid NOT NULL,
	"check_in_date" date NOT NULL,
	"check_out_date" date NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_rounds" ADD COLUMN "hold_duration_minutes" integer DEFAULT 10;--> statement-breakpoint
ALTER TABLE "lodges" ADD COLUMN "check_in_time" text DEFAULT '17:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "lodges" ADD COLUMN "check_out_time" text DEFAULT '16:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "bed_holds" ADD CONSTRAINT "bed_holds_lodge_id_lodges_id_fk" FOREIGN KEY ("lodge_id") REFERENCES "public"."lodges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bed_holds" ADD CONSTRAINT "bed_holds_bed_id_beds_id_fk" FOREIGN KEY ("bed_id") REFERENCES "public"."beds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bed_holds" ADD CONSTRAINT "bed_holds_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bed_holds" ADD CONSTRAINT "bed_holds_booking_round_id_booking_rounds_id_fk" FOREIGN KEY ("booking_round_id") REFERENCES "public"."booking_rounds"("id") ON DELETE no action ON UPDATE no action;