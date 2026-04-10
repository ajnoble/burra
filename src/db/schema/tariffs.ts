import { pgTable, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { lodges } from "./lodges";
import { seasons } from "./seasons";
import { membershipClasses } from "./members";

export const tariffs = pgTable("tariffs", {
  id: uuid("id").defaultRandom().primaryKey(),
  lodgeId: uuid("lodge_id")
    .notNull()
    .references(() => lodges.id),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id),
  membershipClassId: uuid("membership_class_id").references(
    () => membershipClasses.id
  ), // null = default/fallback tariff
  pricePerNightWeekdayCents: integer(
    "price_per_night_weekday_cents"
  ).notNull(),
  pricePerNightWeekendCents: integer(
    "price_per_night_weekend_cents"
  ).notNull(),
  minimumNights: integer("minimum_nights").notNull().default(1),
  discountFiveNightsBps: integer("discount_five_nights_bps")
    .notNull()
    .default(0), // basis points, e.g. 500 = 5%
  discountSevenNightsBps: integer("discount_seven_nights_bps")
    .notNull()
    .default(0),
  singleSupplementCents: integer("single_supplement_cents"), // nullable
  portaCotPricePerNightCents: integer("porta_cot_price_per_night_cents"), // nullable
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
