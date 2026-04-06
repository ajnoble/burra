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
import { profiles } from "./profiles";

export const membershipClasses = pgTable("membership_classes", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(), // e.g. "Full Member", "Associate", "Junior"
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

export const members = pgTable("members", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  profileId: uuid("profile_id").references(() => profiles.id),
  membershipClassId: uuid("membership_class_id")
    .notNull()
    .references(() => membershipClasses.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  dateOfBirth: date("date_of_birth"),
  memberNumber: text("member_number"),
  isFinancial: boolean("is_financial").notNull().default(true),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
  primaryMemberId: uuid("primary_member_id").references(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (): any => members.id
  ),
  notes: text("notes"), // admin only
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const orgMemberRoleEnum = pgEnum("org_member_role", [
  "MEMBER",
  "BOOKING_OFFICER",
  "COMMITTEE",
  "ADMIN",
]);

export const organisationMembers = pgTable("organisation_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  role: orgMemberRoleEnum("role").notNull().default("MEMBER"),
  isActive: boolean("is_active").notNull().default(true),
});

export const financialStatusChanges = pgTable("financial_status_changes", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  isFinancial: boolean("is_financial").notNull(),
  reason: text("reason").notNull(),
  changedByMemberId: uuid("changed_by_member_id")
    .notNull()
    .references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
