import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";

export const lodges = pgTable("lodges", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(),
  address: text("address"),
  description: text("description"),
  imageUrl: text("image_url"),
  totalBeds: integer("total_beds").notNull(),
  checkInTime: text("check_in_time").notNull().default("17:00"),
  checkOutTime: text("check_out_time").notNull().default("16:00"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const rooms = pgTable("rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  lodgeId: uuid("lodge_id")
    .notNull()
    .references(() => lodges.id),
  name: text("name").notNull(),
  floor: text("floor"),
  capacity: integer("capacity").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const beds = pgTable("beds", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id),
  label: text("label").notNull(), // e.g. "Bed 1", "Top Bunk A"
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
