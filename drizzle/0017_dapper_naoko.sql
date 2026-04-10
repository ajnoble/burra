CREATE TABLE "associates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"owner_member_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"date_of_birth" date,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_guests" ALTER COLUMN "member_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_guests" ADD COLUMN "associate_id" uuid;--> statement-breakpoint
ALTER TABLE "booking_guests" ADD COLUMN "porta_cot_requested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lodges" ADD COLUMN "porta_cot_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_classes" ADD COLUMN "is_guest_class" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tariffs" ADD COLUMN "porta_cot_price_per_night_cents" integer;--> statement-breakpoint
ALTER TABLE "associates" ADD CONSTRAINT "associates_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "associates" ADD CONSTRAINT "associates_owner_member_id_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_guests" ADD CONSTRAINT "booking_guests_associate_id_associates_id_fk" FOREIGN KEY ("associate_id") REFERENCES "public"."associates"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "booking_guests" ADD CONSTRAINT "booking_guests_member_or_associate"
  CHECK (
    (member_id IS NOT NULL AND associate_id IS NULL) OR
    (member_id IS NULL AND associate_id IS NOT NULL)
  );