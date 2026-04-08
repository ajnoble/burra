import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";

export const documentCategories = pgTable("document_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
