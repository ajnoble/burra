CREATE TYPE "public"."communication_channel" AS ENUM('EMAIL', 'SMS', 'BOTH');--> statement-breakpoint
CREATE TYPE "public"."communication_status" AS ENUM('DRAFT', 'SENDING', 'SENT', 'PARTIAL_FAILURE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."recipient_channel" AS ENUM('EMAIL', 'SMS');--> statement-breakpoint
CREATE TYPE "public"."recipient_status" AS ENUM('PENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED');--> statement-breakpoint
CREATE TABLE "communication_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"communication_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"channel" "recipient_channel" NOT NULL,
	"status" "recipient_status" DEFAULT 'PENDING' NOT NULL,
	"external_id" varchar(255),
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "communication_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"subject" varchar(255),
	"body_markdown" text NOT NULL,
	"sms_body" text,
	"channel" "communication_channel" NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"template_id" uuid,
	"subject" varchar(255),
	"body_markdown" text NOT NULL,
	"sms_body" text,
	"channel" "communication_channel" NOT NULL,
	"status" "communication_status" DEFAULT 'DRAFT' NOT NULL,
	"filters" jsonb NOT NULL,
	"recipient_count" integer,
	"created_by_member_id" uuid NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "sms_from_number" text;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "sms_pre_arrival_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "sms_pre_arrival_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "sms_payment_reminder_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_template_id_communication_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."communication_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "communication_recipient_unique_idx" ON "communication_recipients" USING btree ("communication_id","member_id","channel");