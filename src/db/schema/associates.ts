import {
  pgTable,
  uuid,
  text,
  date,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
import { members } from "./members";

export const associates = pgTable("associates", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  ownerMemberId: uuid("owner_member_id")
    .notNull()
    .references(() => members.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  dateOfBirth: date("date_of_birth"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
