import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  date,
  jsonb,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
import { lodges, beds, rooms } from "./lodges";
import { members, membershipClasses } from "./members";
import { bookingRounds } from "./seasons";
import { cancellationPolicies } from "./cancellation-policies";
import { tariffs } from "./tariffs";

export const bookingStatusEnum = pgEnum("booking_status", [
  "PENDING",
  "CONFIRMED",
  "WAITLISTED",
  "CANCELLED",
  "COMPLETED",
]);

export const bookings = pgTable("bookings", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  lodgeId: uuid("lodge_id")
    .notNull()
    .references(() => lodges.id),
  bookingRoundId: uuid("booking_round_id")
    .notNull()
    .references(() => bookingRounds.id),
  cancellationPolicyId: uuid("cancellation_policy_id").references(
    () => cancellationPolicies.id
  ),
  primaryMemberId: uuid("primary_member_id").references(() => members.id), // nullable for future guest checkout
  status: bookingStatusEnum("status").notNull().default("PENDING"),
  checkInDate: date("check_in_date").notNull(),
  checkOutDate: date("check_out_date").notNull(),
  totalNights: integer("total_nights").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  discountAmountCents: integer("discount_amount_cents").notNull().default(0),
  totalAmountCents: integer("total_amount_cents").notNull(),
  depositAmountCents: integer("deposit_amount_cents").notNull().default(0),
  depositPaidAt: timestamp("deposit_paid_at", { withTimezone: true }),
  balanceDueDate: date("balance_due_date"),
  balancePaidAt: timestamp("balance_paid_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  refundAmountCents: integer("refund_amount_cents"),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedByMemberId: uuid("approved_by_member_id").references(
    () => members.id
  ),
  bookingReference: text("booking_reference").notNull().unique(), // e.g. BSKI-2027-0042
  notes: text("notes"), // member-visible
  adminNotes: text("admin_notes"), // admin only
  paymentRemindersSentAt: jsonb("payment_reminders_sent_at").$type<Record<string, string>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const bookingGuests = pgTable("booking_guests", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  bedId: uuid("bed_id").references(() => beds.id),
  roomId: uuid("room_id").references(() => rooms.id),
  pricePerNightCents: integer("price_per_night_cents").notNull(),
  totalAmountCents: integer("total_amount_cents").notNull(),
  snapshotTariffId: uuid("snapshot_tariff_id").references(() => tariffs.id),
  snapshotMembershipClassId: uuid("snapshot_membership_class_id").references(
    () => membershipClasses.id
  ),
});

export const bedHolds = pgTable("bed_holds", {
  id: uuid("id").defaultRandom().primaryKey(),
  lodgeId: uuid("lodge_id")
    .notNull()
    .references(() => lodges.id),
  bedId: uuid("bed_id")
    .notNull()
    .references(() => beds.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  bookingRoundId: uuid("booking_round_id")
    .notNull()
    .references(() => bookingRounds.id),
  checkInDate: date("check_in_date").notNull(),
  checkOutDate: date("check_out_date").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
