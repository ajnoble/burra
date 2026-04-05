import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
import { members } from "./members";

export const documentAccessLevelEnum = pgEnum("document_access_level", [
  "PUBLIC",
  "MEMBER",
  "COMMITTEE",
  "ADMIN",
]);

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  title: text("title").notNull(),
  description: text("description"),
  fileUrl: text("file_url").notNull(),
  accessLevel: documentAccessLevelEnum("access_level")
    .notNull()
    .default("MEMBER"),
  uploadedByMemberId: uuid("uploaded_by_member_id")
    .notNull()
    .references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
