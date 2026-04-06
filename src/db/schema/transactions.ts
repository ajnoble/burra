import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  date,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
import { members } from "./members";
import { bookings } from "./bookings";
import { seasons } from "./seasons";

export const transactionTypeEnum = pgEnum("transaction_type", [
  "PAYMENT",
  "REFUND",
  "CREDIT",
  "SUBSCRIPTION",
  "ADJUSTMENT",
  "INVOICE",
]);

export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  bookingId: uuid("booking_id").references(() => bookings.id),
  type: transactionTypeEnum("type").notNull(),
  amountCents: integer("amount_cents").notNull(), // positive = charge, negative = credit
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  platformFeeCents: integer("platform_fee_cents"),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "UNPAID",
  "PAID",
  "WAIVED",
]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id),
  amountCents: integer("amount_cents").notNull(),
  dueDate: date("due_date").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  status: subscriptionStatusEnum("status").notNull().default("UNPAID"),
  waivedReason: text("waived_reason"),
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
