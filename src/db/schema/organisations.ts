import { pgTable, uuid, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const organisations = pgTable("organisations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  timezone: text("timezone").notNull().default("Australia/Melbourne"),
  stripeConnectAccountId: text("stripe_connect_account_id"),
  stripeConnectOnboardingComplete: boolean(
    "stripe_connect_onboarding_complete"
  )
    .notNull()
    .default(false),
  platformFeeBps: integer("platform_fee_bps").notNull().default(100), // 100 bps = 1%
  bookingReminderHours: integer("booking_reminder_hours").notNull().default(48),
  contactEmail: text("contact_email"),
  defaultApprovalNote: text("default_approval_note"),
  subscriptionGraceDays: integer("subscription_grace_days").notNull().default(14),
  contactPhone: text("contact_phone"),
  websiteUrl: text("website_url"),
  address: text("address"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
