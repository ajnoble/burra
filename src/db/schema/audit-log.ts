import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
import { members } from "./members";

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  actorMemberId: uuid("actor_member_id")
    .notNull()
    .references(() => members.id),
  action: text("action").notNull(), // e.g. BOOKING_APPROVED, MEMBER_MARKED_FINANCIAL
  entityType: text("entity_type").notNull(), // e.g. "booking", "member"
  entityId: uuid("entity_id").notNull(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
