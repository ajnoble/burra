CREATE TABLE "financial_status_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"is_financial" boolean NOT NULL,
	"reason" text NOT NULL,
	"changed_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_status_changes" ADD CONSTRAINT "financial_status_changes_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_status_changes" ADD CONSTRAINT "financial_status_changes_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_status_changes" ADD CONSTRAINT "financial_status_changes_changed_by_member_id_members_id_fk" FOREIGN KEY ("changed_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;