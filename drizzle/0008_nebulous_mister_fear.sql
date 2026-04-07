CREATE TYPE "public"."checkout_charge_type" AS ENUM('ONE_OFF_CHARGE', 'SUBSCRIPTION', 'BOOKING_INVOICE');--> statement-breakpoint
CREATE TYPE "public"."one_off_charge_status" AS ENUM('UNPAID', 'PAID', 'WAIVED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "charge_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkout_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_checkout_session_id" text NOT NULL,
	"charge_type" "checkout_charge_type" NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_off_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"description" text,
	"amount_cents" integer NOT NULL,
	"due_date" date,
	"status" "one_off_charge_status" DEFAULT 'UNPAID' NOT NULL,
	"waived_reason" text,
	"paid_at" timestamp with time zone,
	"stripe_payment_intent_id" text,
	"transaction_id" uuid,
	"created_by_member_id" uuid NOT NULL,
	"reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charge_categories" ADD CONSTRAINT "charge_categories_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_line_items" ADD CONSTRAINT "checkout_line_items_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_off_charges" ADD CONSTRAINT "one_off_charges_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_off_charges" ADD CONSTRAINT "one_off_charges_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_off_charges" ADD CONSTRAINT "one_off_charges_category_id_charge_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."charge_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_off_charges" ADD CONSTRAINT "one_off_charges_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_off_charges" ADD CONSTRAINT "one_off_charges_created_by_member_id_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;