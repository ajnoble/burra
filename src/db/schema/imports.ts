import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
import { members } from "./members";

export const importStatusEnum = pgEnum("import_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);

export type ImportError = {
  row: number;
  reason: string;
};

export const memberImports = pgTable("member_imports", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  filename: text("filename").notNull(),
  uploadedByMemberId: uuid("uploaded_by_member_id")
    .notNull()
    .references(() => members.id),
  status: importStatusEnum("status").notNull().default("PENDING"),
  totalRows: integer("total_rows").notNull().default(0),
  processedRows: integer("processed_rows").notNull().default(0),
  errorRows: integer("error_rows").notNull().default(0),
  errors: jsonb("errors").$type<ImportError[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
