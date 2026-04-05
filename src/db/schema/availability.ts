import {
  pgTable,
  uuid,
  date,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { lodges } from "./lodges";

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
    // availableBeds is computed: totalBeds - bookedBeds (not stored)
    version: integer("version").notNull().default(0), // optimistic concurrency
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("availability_lodge_date_idx").on(table.lodgeId, table.date),
  ]
);
