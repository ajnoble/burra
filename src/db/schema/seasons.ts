import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  date,
  jsonb,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";

export const seasons = pgTable("seasons", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(), // e.g. "Winter 2027"
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const bookingRounds = pgTable("booking_rounds", {
  id: uuid("id").defaultRandom().primaryKey(),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id),
  name: text("name").notNull(), // e.g. "Member Priority Round"
  opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
  allowedMembershipClassIds: jsonb("allowed_membership_class_ids")
    .$type<string[]>()
    .notNull()
    .default([]),
  allowGuestCheckout: boolean("allow_guest_checkout")
    .notNull()
    .default(false),
  maxNightsPerMember: integer("max_nights_per_member"),
  maxNightsPerBooking: integer("max_nights_per_booking"),
  holdDurationMinutes: integer("hold_duration_minutes").default(10),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  balanceDueDate: date("balance_due_date"),
  paymentGraceDays: integer("payment_grace_days"),
  paymentReminderDays: jsonb("payment_reminder_days").$type<number[]>(),
  autoCancelRefundPolicy: text("auto_cancel_refund_policy"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
