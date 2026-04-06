import {
  pgTable,
  pgEnum,
  uuid,
  date,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { lodges } from "./lodges";
import { members } from "./members";

export const availabilityCache = pgTable(
  "availability_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lodgeId: uuid("lodge_id")
      .notNull()
      .references(() => lodges.id),
    date: date("date").notNull(),
    totalBeds: integer("total_beds").notNull(),
    bookedBeds: integer("booked_beds").notNull().default(0),
    version: integer("version").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("availability_lodge_date_idx").on(table.lodgeId, table.date),
  ]
);

export const overrideTypeEnum = pgEnum("override_type", [
  "CLOSURE",
  "REDUCTION",
  "EVENT",
]);

export const availabilityOverrides = pgTable("availability_overrides", {
  id: uuid("id").defaultRandom().primaryKey(),
  lodgeId: uuid("lodge_id")
    .notNull()
    .references(() => lodges.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  type: overrideTypeEnum("type").notNull(),
  bedReduction: integer("bed_reduction"),
  reason: text("reason"),
  createdByMemberId: uuid("created_by_member_id")
    .notNull()
    .references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
