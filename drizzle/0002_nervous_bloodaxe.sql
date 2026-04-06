CREATE TYPE "public"."override_type" AS ENUM('CLOSURE', 'REDUCTION');--> statement-breakpoint
CREATE TABLE "availability_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lodge_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"type" "override_type" NOT NULL,
	"bed_reduction" integer,
	"reason" text,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_overrides" ADD CONSTRAINT "availability_overrides_lodge_id_lodges_id_fk" FOREIGN KEY ("lodge_id") REFERENCES "public"."lodges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_overrides" ADD CONSTRAINT "availability_overrides_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;