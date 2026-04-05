import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  timestamp,
  date,
} from "drizzle-orm/pg-core";
import { bookingRounds } from "./seasons";
import { lodges } from "./lodges";
import { members } from "./members";

export const waitlistStatusEnum = pgEnum("waitlist_status", [
  "WAITING",
  "NOTIFIED",
  "CONVERTED",
  "EXPIRED",
]);

export const waitlistEntries = pgTable("waitlist_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookingRoundId: uuid("booking_round_id")
    .notNull()
    .references(() => bookingRounds.id),
  lodgeId: uuid("lodge_id")
    .notNull()
    .references(() => lodges.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  checkInDate: date("check_in_date").notNull(),
  checkOutDate: date("check_out_date").notNull(),
  numberOfGuests: integer("number_of_guests").notNull(),
  status: waitlistStatusEnum("status").notNull().default("WAITING"),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
