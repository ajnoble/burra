import {
  pgTable,
  uuid,
  text,
  jsonb,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";

export type CancellationRule = {
  daysBeforeCheckin: number;
  forfeitPercentage: number;
};

export const cancellationPolicies = pgTable("cancellation_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(), // e.g. "Standard Policy"
  rules: jsonb("rules").$type<CancellationRule[]>().notNull().default([]),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
