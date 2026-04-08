import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
import { members } from "./members";
import { documentCategories } from "./document-categories";

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
  categoryId: uuid("category_id").references(() => documentCategories.id),
  title: text("title").notNull(),
  description: text("description"),
  fileUrl: text("file_url").notNull(),
  fileSizeBytes: integer("file_size_bytes"),
  mimeType: text("mime_type"),
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
