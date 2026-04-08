import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
import { members } from "./members";

export type CommunicationFilters = {
  membershipClassIds?: string[];
  isFinancial?: boolean;
  seasonId?: string;
  bookingStatus?: string;
  role?: string;
  manualInclude?: string[];
  manualExclude?: string[];
};

export const communicationChannelEnum = pgEnum("communication_channel", [
  "EMAIL",
  "SMS",
  "BOTH",
]);

export const communicationStatusEnum = pgEnum("communication_status", [
  "DRAFT",
  "SENDING",
  "SENT",
  "PARTIAL_FAILURE",
  "FAILED",
]);

export const recipientStatusEnum = pgEnum("recipient_status", [
  "PENDING",
  "SENT",
  "DELIVERED",
  "OPENED",
  "CLICKED",
  "BOUNCED",
  "FAILED",
]);

export const recipientChannelEnum = pgEnum("recipient_channel", [
  "EMAIL",
  "SMS",
]);

export const communicationTemplates = pgTable("communication_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 255 }),
  bodyMarkdown: text("body_markdown").notNull(),
  smsBody: text("sms_body"),
  channel: communicationChannelEnum("channel").notNull(),
  createdByMemberId: uuid("created_by_member_id")
    .notNull()
    .references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const communications = pgTable("communications", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  templateId: uuid("template_id").references(
    () => communicationTemplates.id
  ),
  subject: varchar("subject", { length: 255 }),
  bodyMarkdown: text("body_markdown").notNull(),
  smsBody: text("sms_body"),
  channel: communicationChannelEnum("channel").notNull(),
  status: communicationStatusEnum("status").notNull().default("DRAFT"),
  filters: jsonb("filters").$type<CommunicationFilters>().notNull(),
  recipientCount: integer("recipient_count"),
  createdByMemberId: uuid("created_by_member_id")
    .notNull()
    .references(() => members.id),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const communicationRecipients = pgTable(
  "communication_recipients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    communicationId: uuid("communication_id")
      .notNull()
      .references(() => communications.id),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    channel: recipientChannelEnum("channel").notNull(),
    status: recipientStatusEnum("status").notNull().default("PENDING"),
    externalId: varchar("external_id", { length: 255 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    error: text("error"),
  },
  (table) => [
    uniqueIndex("communication_recipient_unique_idx").on(
      table.communicationId,
      table.memberId,
      table.channel
    ),
  ]
);
