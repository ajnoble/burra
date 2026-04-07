import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  date,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
import { members } from "./members";
import { transactions } from "./transactions";

export const chargeCategories = pgTable("charge_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const oneOffChargeStatusEnum = pgEnum("one_off_charge_status", [
  "UNPAID",
  "PAID",
  "WAIVED",
  "CANCELLED",
]);

export const oneOffCharges = pgTable("one_off_charges", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => chargeCategories.id),
  description: text("description"),
  amountCents: integer("amount_cents").notNull(),
  dueDate: date("due_date"),
  status: oneOffChargeStatusEnum("status").notNull().default("UNPAID"),
  waivedReason: text("waived_reason"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  transactionId: uuid("transaction_id").references(() => transactions.id),
  createdByMemberId: uuid("created_by_member_id")
    .notNull()
    .references(() => members.id),
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const checkoutChargeTypeEnum = pgEnum("checkout_charge_type", [
  "ONE_OFF_CHARGE",
  "SUBSCRIPTION",
  "BOOKING_INVOICE",
]);

export const checkoutLineItems = pgTable("checkout_line_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  stripeCheckoutSessionId: text("stripe_checkout_session_id").notNull(),
  chargeType: checkoutChargeTypeEnum("charge_type").notNull(),
  chargeId: uuid("charge_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
