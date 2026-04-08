# Phase 15: Bulk Communications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable committees to compose and send targeted email and SMS communications to filtered member lists, with reusable templates, draft management, delivery tracking via webhooks, and automated SMS triggers for pre-arrival and payment reminders.

**Architecture:** Three new DB tables (communication_templates, communications, communication_recipients) plus org-level SMS config columns. Server actions handle CRUD, recipient resolution, and batch sending. Resend sends emails with a new markdown-rendered template; Telnyx sends SMS. Webhook endpoints update per-recipient delivery status. Existing cron jobs are extended with optional SMS triggers. The UI is a tabbed communications page (Messages/Templates/Settings) with a compose page featuring a markdown editor, recipient filters, and preview.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, PostgreSQL, Vitest, React Email + Resend, Telnyx (SMS), `marked` + `dompurify` (markdown→sanitized HTML), shadcn/ui, Playwright (E2E)

**Security:** All markdown-rendered HTML is sanitized via DOMPurify before being passed to `dangerouslySetInnerHTML` or email templates. This prevents XSS from admin-authored content.

---

### Task 1: Schema — Add communication enums and tables

**Files:**
- Create: `src/db/schema/communications.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create the communications schema file**

Create `src/db/schema/communications.ts`:

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
import { members } from "./members";

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

export type CommunicationFilters = {
  membershipClassIds?: string[];
  isFinancial?: boolean;
  seasonId?: string;
  bookingStatus?: string;
  role?: string;
  manualInclude?: string[];
  manualExclude?: string[];
};

export const communications = pgTable("communications", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  templateId: uuid("template_id").references(() => communicationTemplates.id),
  subject: varchar("subject", { length: 255 }),
  bodyMarkdown: text("body_markdown").notNull(),
  smsBody: text("sms_body"),
  channel: communicationChannelEnum("channel").notNull(),
  status: communicationStatusEnum("status").notNull().default("DRAFT"),
  filters: jsonb("filters").$type<CommunicationFilters>(),
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
    uniqueIndex("comm_recipient_channel_idx").on(
      table.communicationId,
      table.memberId,
      table.channel
    ),
  ]
);
```

- [ ] **Step 2: Export from schema index**

In `src/db/schema/index.ts`, add at the end:

```typescript
export {
  communicationChannelEnum,
  communicationStatusEnum,
  recipientStatusEnum,
  recipientChannelEnum,
  communicationTemplates,
  communications,
  communicationRecipients,
} from "./communications";
export type { CommunicationFilters } from "./communications";
```

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/communications.ts src/db/schema/index.ts
git commit -m "feat(phase-15): add communications schema with templates, messages, and recipients"
```

---

### Task 2: Schema — Add SMS config columns to organisations

**Files:**
- Modify: `src/db/schema/organisations.ts`

- [ ] **Step 1: Add SMS columns to organisations schema**

In `src/db/schema/organisations.ts`, add four columns after `address`:

```typescript
smsFromNumber: text("sms_from_number"),
smsPreArrivalEnabled: boolean("sms_pre_arrival_enabled").notNull().default(false),
smsPreArrivalHours: integer("sms_pre_arrival_hours").notNull().default(24),
smsPaymentReminderEnabled: boolean("sms_payment_reminder_enabled").notNull().default(false),
```

- [ ] **Step 2: Commit**

```bash
git add src/db/schema/organisations.ts
git commit -m "feat(phase-15): add SMS config columns to organisations schema"
```

---

### Task 3: Generate and run database migration

**Files:**
- Create: `drizzle/0010_*.sql` (auto-generated)

- [ ] **Step 1: Generate the migration**

```bash
npx drizzle-kit generate
```

Expected: A new migration SQL file in `drizzle/` with CREATE TYPE and CREATE TABLE statements.

- [ ] **Step 2: Review the generated SQL**

Read the generated migration file and verify it creates:
- 4 enums: `communication_channel`, `communication_status`, `recipient_status`, `recipient_channel`
- 3 tables: `communication_templates`, `communications`, `communication_recipients`
- 4 new columns on `organisations`
- Unique index on `communication_recipients`

- [ ] **Step 3: Run the migration**

```bash
npx drizzle-kit push
```

Expected: Migration applies successfully.

- [ ] **Step 4: Commit**

```bash
git add drizzle/
git commit -m "feat(phase-15): add migration for communications tables and org SMS columns"
```

---

### Task 4: Install dependencies — Telnyx, marked, dompurify

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
npm install telnyx marked dompurify
npm install -D @types/dompurify
```

Note: `@types/marked` may not be needed as `marked` ships its own types. Check and install if needed.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(phase-15): add telnyx, marked, and dompurify dependencies"
```

---

### Task 5: SMS client — Telnyx integration

**Files:**
- Create: `src/lib/sms/client.ts`
- Create: `src/lib/sms/send.ts`
- Create: `src/lib/sms/__tests__/send.test.ts`

- [ ] **Step 1: Write the failing test for sendSMS**

Create `src/lib/sms/__tests__/send.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("telnyx", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { sendSMS } from "../send";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELNYX_API_KEY = "test-key";
});

describe("sendSMS", () => {
  it("sends an SMS and returns the message ID", async () => {
    mockCreate.mockResolvedValue({
      data: { id: "msg-123" },
    });

    const result = await sendSMS({
      to: "+61412345678",
      body: "Hello from Snow Gum",
      from: "+61400000000",
    });

    expect(result).toEqual({ messageId: "msg-123" });
    expect(mockCreate).toHaveBeenCalledWith({
      from: "+61400000000",
      to: "+61412345678",
      text: "Hello from Snow Gum",
    });
  });

  it("returns error when send fails", async () => {
    mockCreate.mockRejectedValue(new Error("Network error"));

    const result = await sendSMS({
      to: "+61412345678",
      body: "Hello",
      from: "+61400000000",
    });

    expect(result).toEqual({ messageId: null, error: "Network error" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/sms/__tests__/send.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create SMS client**

Create `src/lib/sms/client.ts`:

```typescript
import Telnyx from "telnyx";

let telnyxClient: ReturnType<typeof Telnyx> | null = null;

export function getTelnyxClient() {
  if (!telnyxClient) {
    const apiKey = process.env.TELNYX_API_KEY;
    if (!apiKey) {
      throw new Error("TELNYX_API_KEY environment variable is not set");
    }
    telnyxClient = Telnyx(apiKey);
  }
  return telnyxClient;
}
```

- [ ] **Step 4: Create sendSMS helper**

Create `src/lib/sms/send.ts`:

```typescript
import { getTelnyxClient } from "./client";

type SendSMSOptions = {
  to: string;
  body: string;
  from: string;
};

type SendSMSResult = {
  messageId: string | null;
  error?: string;
};

export async function sendSMS(options: SendSMSOptions): Promise<SendSMSResult> {
  try {
    const telnyx = getTelnyxClient();
    const response = await telnyx.messages.create({
      from: options.from,
      to: options.to,
      text: options.body,
    });
    return { messageId: response.data.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SMS error";
    console.error("[sms] Failed to send:", message);
    return { messageId: null, error: message };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/lib/sms/__tests__/send.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/sms/
git commit -m "feat(phase-15): add Telnyx SMS client and sendSMS helper"
```

---

### Task 6: Enhanced sendEmail — return message ID for tracking

**Files:**
- Modify: `src/lib/email/send.ts`
- Create: `src/lib/email/__tests__/send.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/email/__tests__/send.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

vi.mock("../client", () => ({
  getResendClient: vi.fn().mockReturnValue({
    emails: { send: mockSend },
  }),
}));

import { sendEmailTracked } from "../send";
import React from "react";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendEmailTracked", () => {
  it("sends email and returns the message ID", async () => {
    mockSend.mockResolvedValue({ data: { id: "resend-msg-123" } });

    const result = await sendEmailTracked({
      to: "test@example.com",
      subject: "Hello",
      template: React.createElement("div", null, "Test"),
      orgName: "Test Org",
    });

    expect(result).toEqual({ messageId: "resend-msg-123" });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "test@example.com",
        subject: "Hello",
        from: "Test Org via Snow Gum <noreply@snowgum.site>",
      })
    );
  });

  it("returns error when send fails", async () => {
    mockSend.mockRejectedValue(new Error("API error"));

    const result = await sendEmailTracked({
      to: "test@example.com",
      subject: "Hello",
      template: React.createElement("div", null, "Test"),
    });

    expect(result).toEqual({ messageId: null, error: "API error" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/email/__tests__/send.test.ts
```

Expected: FAIL — `sendEmailTracked` not found.

- [ ] **Step 3: Add sendEmailTracked to send.ts**

In `src/lib/email/send.ts`, add below the existing `sendEmail` function (do NOT modify the existing function):

```typescript
type SendEmailTrackedResult = {
  messageId: string | null;
  error?: string;
};

export async function sendEmailTracked(
  options: SendEmailOptions
): Promise<SendEmailTrackedResult> {
  const { to, subject, template, replyTo, orgName } = options;
  const displayName = orgName ? `${orgName} via Snow Gum` : "Snow Gum";
  const from = `${displayName} <noreply@snowgum.site>`;

  const resend = getResendClient();

  try {
    const response = await resend.emails.send({
      from,
      to,
      subject,
      react: template,
      replyTo,
    });
    return { messageId: response.data?.id ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error";
    console.error("[email] Failed to send:", message);
    return { messageId: null, error: message };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/email/__tests__/send.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/send.ts src/lib/email/__tests__/
git commit -m "feat(phase-15): add sendEmailTracked with message ID return for delivery tracking"
```

---

### Task 7: Markdown renderer utility with sanitization

**Files:**
- Create: `src/lib/markdown.ts`
- Create: `src/lib/__tests__/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/markdown.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../markdown";

describe("renderMarkdown", () => {
  it("converts headings", () => {
    expect(renderMarkdown("# Hello")).toContain("<h1>Hello</h1>");
  });

  it("converts bold text", () => {
    expect(renderMarkdown("**important**")).toContain("<strong>important</strong>");
  });

  it("converts links", () => {
    const html = renderMarkdown("[click here](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("click here");
  });

  it("converts unordered lists", () => {
    const html = renderMarkdown("- item one\n- item two");
    expect(html).toContain("<li>item one</li>");
    expect(html).toContain("<li>item two</li>");
  });

  it("converts paragraphs", () => {
    const html = renderMarkdown("First paragraph\n\nSecond paragraph");
    expect(html).toContain("<p>First paragraph</p>");
    expect(html).toContain("<p>Second paragraph</p>");
  });

  it("handles empty input", () => {
    expect(renderMarkdown("")).toBe("");
  });

  it("strips script tags (XSS prevention)", () => {
    const html = renderMarkdown('<script>alert("xss")</script>Hello');
    expect(html).not.toContain("<script>");
    expect(html).toContain("Hello");
  });

  it("strips event handlers (XSS prevention)", () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/markdown.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the markdown renderer with DOMPurify sanitization**

Create `src/lib/markdown.ts`:

```typescript
import { marked } from "marked";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

// DOMPurify needs a window object on the server
const window = new JSDOM("").window;
const purify = DOMPurify(window);

export function renderMarkdown(input: string): string {
  if (!input) return "";
  const raw = marked.parse(input, { async: false }) as string;
  return purify.sanitize(raw);
}
```

Note: `jsdom` is already a transitive dependency via Vitest. If it's not available at runtime, the implementer should install it: `npm install jsdom` and `npm install -D @types/jsdom`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/markdown.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown.ts src/lib/__tests__/markdown.test.ts
git commit -m "feat(phase-15): add markdown renderer with DOMPurify sanitization"
```

---

### Task 8: Bulk communication email template

**Files:**
- Create: `src/lib/email/templates/bulk-communication.tsx`
- Create: `src/lib/email/templates/__tests__/bulk-communication.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/email/templates/__tests__/bulk-communication.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import { BulkCommunicationEmail } from "../bulk-communication";

describe("BulkCommunicationEmail", () => {
  it("renders HTML content within layout", async () => {
    const html = await render(
      BulkCommunicationEmail({
        orgName: "Test Club",
        bodyHtml: "<h1>Hello Members</h1><p>Important update.</p>",
      })
    );

    expect(html).toContain("Hello Members");
    expect(html).toContain("Important update");
    expect(html).toContain("Test Club");
  });

  it("renders without logo when not provided", async () => {
    const html = await render(
      BulkCommunicationEmail({
        orgName: "Test Club",
        bodyHtml: "<p>Simple message</p>",
      })
    );

    expect(html).toContain("Simple message");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/email/templates/__tests__/bulk-communication.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the bulk communication email template**

Create `src/lib/email/templates/bulk-communication.tsx`:

```typescript
import { Section } from "@react-email/components";
import { EmailLayout } from "./layout";

type BulkCommunicationEmailProps = {
  orgName: string;
  bodyHtml: string;
  logoUrl?: string;
};

export function BulkCommunicationEmail({
  orgName,
  bodyHtml,
  logoUrl,
}: BulkCommunicationEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Section>
        <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      </Section>
    </EmailLayout>
  );
}
```

Note: The `bodyHtml` passed to this template MUST be pre-sanitized via `renderMarkdown()` (which uses DOMPurify). The `sendCommunication` action handles this — the template itself is not responsible for sanitization.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/email/templates/__tests__/bulk-communication.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/bulk-communication.tsx src/lib/email/templates/__tests__/
git commit -m "feat(phase-15): add BulkCommunicationEmail template for markdown-rendered messages"
```

---

### Task 9: Server action — Resolve recipients from filters

**Files:**
- Create: `src/actions/communications/recipients.ts`
- Create: `src/actions/communications/__tests__/recipients.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/communications/__tests__/recipients.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInnerJoin = vi.fn();
const mockLeftJoin = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            innerJoin: (...jArgs: unknown[]) => {
              mockInnerJoin(...jArgs);
              return {
                leftJoin: (...ljArgs: unknown[]) => {
                  mockLeftJoin(...ljArgs);
                  return {
                    where: (...wArgs: unknown[]) => {
                      mockWhere(...wArgs);
                      return {
                        orderBy: (...oArgs: unknown[]) => {
                          mockOrderBy(...oArgs);
                          return [
                            { id: "m1", firstName: "Alice", lastName: "Smith", email: "alice@test.com", phone: "+61412345678", membershipClassName: "Full" },
                            { id: "m2", firstName: "Bob", lastName: "Jones", email: "bob@test.com", phone: null, membershipClassName: "Associate" },
                            { id: "m3", firstName: "Carol", lastName: "Lee", email: "carol@test.com", phone: "+61400000000", membershipClassName: "Full" },
                          ];
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  members: { id: "id", organisationId: "organisationId", firstName: "firstName", lastName: "lastName", email: "email", phone: "phone", membershipClassId: "membershipClassId", isFinancial: "isFinancial" },
  organisationMembers: { memberId: "memberId", organisationId: "organisationId", role: "role", isActive: "isActive" },
  membershipClasses: { id: "id", name: "name" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  inArray: vi.fn(),
  ilike: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  canAccessAdmin: vi.fn().mockReturnValue(true),
  isCommitteeOrAbove: vi.fn().mockReturnValue(true),
}));

import { resolveRecipients } from "../recipients";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveRecipients", () => {
  it("returns all members matching the org with contact info flags", async () => {
    const result = await resolveRecipients({
      organisationId: "org-1",
      filters: {},
      channel: "BOTH",
    });

    expect(result.success).toBe(true);
    expect(result.recipients).toHaveLength(3);
    expect(result.recipients![0]).toEqual(
      expect.objectContaining({ id: "m1", hasEmail: true, hasPhone: true })
    );
    expect(result.recipients![1]).toEqual(
      expect.objectContaining({ id: "m2", hasEmail: true, hasPhone: false })
    );
  });

  it("applies manual exclude filter", async () => {
    const result = await resolveRecipients({
      organisationId: "org-1",
      filters: { manualExclude: ["m2"] },
      channel: "EMAIL",
    });

    expect(result.success).toBe(true);
    expect(result.recipients).toHaveLength(2);
    expect(result.recipients!.map((r: { id: string }) => r.id)).not.toContain("m2");
  });

  it("returns emailCount and smsCount", async () => {
    const result = await resolveRecipients({
      organisationId: "org-1",
      filters: {},
      channel: "BOTH",
    });

    expect(result.emailCount).toBe(3);
    expect(result.smsCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/actions/communications/__tests__/recipients.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement resolveRecipients**

Create `src/actions/communications/recipients.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { members, organisationMembers, membershipClasses } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { CommunicationFilters } from "@/db/schema/communications";

type RecipientRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  membershipClassName: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
};

type ResolveRecipientsInput = {
  organisationId: string;
  filters: CommunicationFilters;
  channel: "EMAIL" | "SMS" | "BOTH";
};

type ResolveRecipientsResult = {
  success: boolean;
  recipients?: RecipientRow[];
  emailCount?: number;
  smsCount?: number;
  error?: string;
};

export async function resolveRecipients(
  input: ResolveRecipientsInput
): Promise<ResolveRecipientsResult> {
  const { organisationId, filters } = input;

  const conditions = [
    eq(members.organisationId, organisationId),
    eq(organisationMembers.isActive, true),
  ];

  if (filters.membershipClassIds && filters.membershipClassIds.length > 0) {
    conditions.push(inArray(members.membershipClassId, filters.membershipClassIds));
  }

  if (filters.isFinancial !== undefined) {
    conditions.push(eq(members.isFinancial, filters.isFinancial));
  }

  if (filters.role) {
    conditions.push(eq(organisationMembers.role, filters.role as "MEMBER" | "BOOKING_OFFICER" | "COMMITTEE" | "ADMIN"));
  }

  const rows = await db
    .select({
      id: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
      email: members.email,
      phone: members.phone,
      membershipClassName: membershipClasses.name,
    })
    .from(members)
    .innerJoin(
      organisationMembers,
      and(
        eq(organisationMembers.memberId, members.id),
        eq(organisationMembers.organisationId, organisationId)
      )
    )
    .leftJoin(membershipClasses, eq(membershipClasses.id, members.membershipClassId))
    .where(and(...conditions))
    .orderBy(members.lastName, members.firstName);

  let filtered = rows;

  if (filters.manualExclude && filters.manualExclude.length > 0) {
    const excludeSet = new Set(filters.manualExclude);
    filtered = filtered.filter((r) => !excludeSet.has(r.id));
  }

  const recipients: RecipientRow[] = filtered.map((r) => ({
    ...r,
    hasEmail: Boolean(r.email),
    hasPhone: Boolean(r.phone),
  }));

  const emailCount = recipients.filter((r) => r.hasEmail).length;
  const smsCount = recipients.filter((r) => r.hasPhone).length;

  return { success: true, recipients, emailCount, smsCount };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/actions/communications/__tests__/recipients.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/communications/
git commit -m "feat(phase-15): add resolveRecipients action with filter support"
```

---

### Task 10: Server action — Template CRUD

**Files:**
- Create: `src/actions/communications/templates.ts`
- Create: `src/actions/communications/__tests__/templates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/communications/__tests__/templates.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return {
            returning: () => {
              mockReturning();
              return [{ id: "tpl-1", name: "Welcome Template" }];
            },
          };
        },
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return {
                orderBy: () => [
                  { id: "tpl-1", name: "Welcome", channel: "EMAIL" },
                  { id: "tpl-2", name: "Reminder", channel: "SMS" },
                ],
              };
            },
          };
        },
      };
    },
    update: () => ({
      set: () => ({
        where: () => ({ returning: () => [{ id: "tpl-1" }] }),
      }),
    }),
    delete: (...args: unknown[]) => {
      mockDelete(...args);
      return { where: () => ({}) };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  communicationTemplates: { id: "id", organisationId: "organisationId", name: "name" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  isCommitteeOrAbove: vi.fn().mockReturnValue(true),
}));

import { createTemplate, listTemplates, deleteTemplate } from "../templates";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createTemplate", () => {
  it("creates a template and returns success", async () => {
    const result = await createTemplate({
      organisationId: "org-1",
      name: "Welcome Template",
      subject: "Welcome!",
      bodyMarkdown: "# Hello\nWelcome to our club.",
      channel: "EMAIL",
      createdByMemberId: "admin-1",
      slug: "test-org",
    });

    expect(result.success).toBe(true);
    expect(result.template).toEqual(expect.objectContaining({ id: "tpl-1" }));
    expect(mockInsert).toHaveBeenCalled();
  });

  it("rejects empty name", async () => {
    const result = await createTemplate({
      organisationId: "org-1",
      name: "",
      bodyMarkdown: "content",
      channel: "EMAIL",
      createdByMemberId: "admin-1",
      slug: "test-org",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Template name is required");
  });
});

describe("listTemplates", () => {
  it("returns templates for the organisation", async () => {
    const result = await listTemplates("org-1");
    expect(result).toHaveLength(2);
  });
});

describe("deleteTemplate", () => {
  it("deletes a template", async () => {
    const result = await deleteTemplate({
      templateId: "tpl-1",
      organisationId: "org-1",
      slug: "test-org",
    });

    expect(result.success).toBe(true);
    expect(mockDelete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/actions/communications/__tests__/templates.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement template CRUD**

Create `src/actions/communications/templates.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { communicationTemplates } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";

type CreateTemplateInput = {
  organisationId: string;
  name: string;
  subject?: string;
  bodyMarkdown: string;
  smsBody?: string;
  channel: "EMAIL" | "SMS" | "BOTH";
  createdByMemberId: string;
  slug: string;
};

export async function createTemplate(input: CreateTemplateInput) {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  if (!input.name.trim()) {
    return { success: false, error: "Template name is required" };
  }

  if (!input.bodyMarkdown.trim()) {
    return { success: false, error: "Template body is required" };
  }

  const [template] = await db
    .insert(communicationTemplates)
    .values({
      organisationId: input.organisationId,
      name: input.name.trim(),
      subject: input.subject?.trim() || null,
      bodyMarkdown: input.bodyMarkdown,
      smsBody: input.smsBody?.trim() || null,
      channel: input.channel,
      createdByMemberId: input.createdByMemberId,
    })
    .returning();

  revalidatePath(`/${input.slug}/admin/communications`);
  return { success: true, template };
}

export async function listTemplates(organisationId: string) {
  return db
    .select()
    .from(communicationTemplates)
    .where(eq(communicationTemplates.organisationId, organisationId))
    .orderBy(desc(communicationTemplates.updatedAt));
}

type UpdateTemplateInput = {
  templateId: string;
  organisationId: string;
  name?: string;
  subject?: string;
  bodyMarkdown?: string;
  smsBody?: string;
  channel?: "EMAIL" | "SMS" | "BOTH";
  slug: string;
};

export async function updateTemplate(input: UpdateTemplateInput) {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.subject !== undefined) updates.subject = input.subject.trim() || null;
  if (input.bodyMarkdown !== undefined) updates.bodyMarkdown = input.bodyMarkdown;
  if (input.smsBody !== undefined) updates.smsBody = input.smsBody.trim() || null;
  if (input.channel !== undefined) updates.channel = input.channel;

  const [updated] = await db
    .update(communicationTemplates)
    .set(updates)
    .where(
      and(
        eq(communicationTemplates.id, input.templateId),
        eq(communicationTemplates.organisationId, input.organisationId)
      )
    )
    .returning();

  revalidatePath(`/${input.slug}/admin/communications`);
  return { success: true, template: updated };
}

export async function deleteTemplate(input: {
  templateId: string;
  organisationId: string;
  slug: string;
}) {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  await db
    .delete(communicationTemplates)
    .where(
      and(
        eq(communicationTemplates.id, input.templateId),
        eq(communicationTemplates.organisationId, input.organisationId)
      )
    );

  revalidatePath(`/${input.slug}/admin/communications`);
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/actions/communications/__tests__/templates.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/communications/
git commit -m "feat(phase-15): add communication template CRUD actions"
```

---

### Task 11: Server action — Create/update draft

**Files:**
- Create: `src/actions/communications/create-draft.ts`
- Create: `src/actions/communications/__tests__/create-draft.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/communications/__tests__/create-draft.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return {
            returning: () => {
              mockReturning();
              return [{ id: "comm-1", status: "DRAFT" }];
            },
          };
        },
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return {
            where: () => ({
              returning: () => [{ id: "comm-1", status: "DRAFT" }],
            }),
          };
        },
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: () => [{ id: "comm-1", status: "DRAFT" }],
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  communications: { id: "id", organisationId: "organisationId", status: "status" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  isCommitteeOrAbove: vi.fn().mockReturnValue(true),
}));

import { createDraft, updateDraft } from "../create-draft";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createDraft", () => {
  it("creates a new draft communication", async () => {
    const result = await createDraft({
      organisationId: "org-1",
      subject: "Test Subject",
      bodyMarkdown: "# Hello",
      channel: "EMAIL",
      filters: { isFinancial: true },
      createdByMemberId: "admin-1",
      slug: "test-org",
    });

    expect(result.success).toBe(true);
    expect(result.communication).toEqual(expect.objectContaining({ id: "comm-1" }));
    expect(mockInsert).toHaveBeenCalled();
  });

  it("rejects empty body", async () => {
    const result = await createDraft({
      organisationId: "org-1",
      bodyMarkdown: "",
      channel: "EMAIL",
      createdByMemberId: "admin-1",
      slug: "test-org",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Message body is required");
  });
});

describe("updateDraft", () => {
  it("updates an existing draft", async () => {
    const result = await updateDraft({
      communicationId: "comm-1",
      organisationId: "org-1",
      subject: "Updated Subject",
      bodyMarkdown: "# Updated",
      slug: "test-org",
    });

    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/actions/communications/__tests__/create-draft.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement createDraft and updateDraft**

Create `src/actions/communications/create-draft.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { communications } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import type { CommunicationFilters } from "@/db/schema/communications";

type CreateDraftInput = {
  organisationId: string;
  templateId?: string;
  subject?: string;
  bodyMarkdown: string;
  smsBody?: string;
  channel: "EMAIL" | "SMS" | "BOTH";
  filters?: CommunicationFilters;
  createdByMemberId: string;
  slug: string;
};

export async function createDraft(input: CreateDraftInput) {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  if (!input.bodyMarkdown.trim()) {
    return { success: false, error: "Message body is required" };
  }

  const [communication] = await db
    .insert(communications)
    .values({
      organisationId: input.organisationId,
      templateId: input.templateId || null,
      subject: input.subject?.trim() || null,
      bodyMarkdown: input.bodyMarkdown,
      smsBody: input.smsBody?.trim() || null,
      channel: input.channel,
      status: "DRAFT",
      filters: input.filters || null,
      createdByMemberId: input.createdByMemberId,
    })
    .returning();

  revalidatePath(`/${input.slug}/admin/communications`);
  return { success: true, communication };
}

type UpdateDraftInput = {
  communicationId: string;
  organisationId: string;
  subject?: string;
  bodyMarkdown?: string;
  smsBody?: string;
  channel?: "EMAIL" | "SMS" | "BOTH";
  filters?: CommunicationFilters;
  slug: string;
};

export async function updateDraft(input: UpdateDraftInput) {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  const [existing] = await db
    .select({ id: communications.id, status: communications.status })
    .from(communications)
    .where(
      and(
        eq(communications.id, input.communicationId),
        eq(communications.organisationId, input.organisationId)
      )
    );

  if (!existing) return { success: false, error: "Communication not found" };
  if (existing.status !== "DRAFT") return { success: false, error: "Only drafts can be edited" };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.subject !== undefined) updates.subject = input.subject.trim() || null;
  if (input.bodyMarkdown !== undefined) updates.bodyMarkdown = input.bodyMarkdown;
  if (input.smsBody !== undefined) updates.smsBody = input.smsBody.trim() || null;
  if (input.channel !== undefined) updates.channel = input.channel;
  if (input.filters !== undefined) updates.filters = input.filters;

  const [updated] = await db
    .update(communications)
    .set(updates)
    .where(eq(communications.id, input.communicationId))
    .returning();

  revalidatePath(`/${input.slug}/admin/communications`);
  return { success: true, communication: updated };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/actions/communications/__tests__/create-draft.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/communications/
git commit -m "feat(phase-15): add createDraft and updateDraft actions"
```

---

### Task 12: Server action — Send communication

**Files:**
- Create: `src/actions/communications/send.ts`
- Create: `src/actions/communications/__tests__/send.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/communications/__tests__/send.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              const callCount = mockWhere.mock.calls.length;
              if (callCount === 1) {
                return [{
                  id: "comm-1",
                  status: "DRAFT",
                  channel: "EMAIL",
                  subject: "Test",
                  bodyMarkdown: "# Hello",
                  smsBody: null,
                  organisationId: "org-1",
                }];
              }
              if (callCount === 2) {
                return [{
                  name: "Test Org",
                  contactEmail: "contact@test.com",
                  logoUrl: null,
                  smsFromNumber: "+61400000000",
                }];
              }
              return [];
            },
            innerJoin: () => ({
              leftJoin: () => ({
                where: () => ({
                  orderBy: () => [
                    { id: "m1", email: "alice@test.com", phone: "+61412345678", firstName: "Alice", lastName: "Smith", membershipClassName: "Full" },
                    { id: "m2", email: "bob@test.com", phone: null, firstName: "Bob", lastName: "Jones", membershipClassName: "Full" },
                  ],
                }),
              }),
            }),
          };
        },
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return { where: () => ({}) };
        },
      };
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return { returning: () => vArgs[0].map((v: Record<string, unknown>, i: number) => ({ id: `rec-${i}`, ...v })) };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  communications: { id: "id", organisationId: "organisationId", status: "status" },
  communicationRecipients: { id: "id", communicationId: "communicationId" },
  organisations: { id: "id", name: "name" },
  members: { id: "id", organisationId: "organisationId", email: "email", phone: "phone", firstName: "firstName", lastName: "lastName", membershipClassId: "membershipClassId", isFinancial: "isFinancial" },
  organisationMembers: { memberId: "memberId", organisationId: "organisationId", role: "role", isActive: "isActive" },
  membershipClasses: { id: "id", name: "name" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  isCommitteeOrAbove: vi.fn().mockReturnValue(true),
}));

const mockSendEmailTracked = vi.fn().mockResolvedValue({ messageId: "resend-123" });
vi.mock("@/lib/email/send", () => ({
  sendEmailTracked: (...args: unknown[]) => mockSendEmailTracked(...args),
}));

vi.mock("@/lib/email/templates/bulk-communication", () => ({
  BulkCommunicationEmail: vi.fn(),
}));

vi.mock("@/lib/markdown", () => ({
  renderMarkdown: vi.fn().mockReturnValue("<h1>Hello</h1>"),
}));

const mockSendSMS = vi.fn().mockResolvedValue({ messageId: "telnyx-123" });
vi.mock("@/lib/sms/send", () => ({
  sendSMS: (...args: unknown[]) => mockSendSMS(...args),
}));

import { sendCommunication } from "../send";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendCommunication", () => {
  it("sends email to all recipients with email addresses", async () => {
    const result = await sendCommunication({
      communicationId: "comm-1",
      organisationId: "org-1",
      filters: {},
      slug: "test-org",
    });

    expect(result.success).toBe(true);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(mockSendEmailTracked).toHaveBeenCalledTimes(2);
  });

  it("updates communication status to SENDING then SENT", async () => {
    await sendCommunication({
      communicationId: "comm-1",
      organisationId: "org-1",
      filters: {},
      slug: "test-org",
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "SENDING" })
    );
  });

  it("records PARTIAL_FAILURE when some sends fail", async () => {
    mockSendEmailTracked
      .mockResolvedValueOnce({ messageId: "resend-123" })
      .mockResolvedValueOnce({ messageId: null, error: "Bounce" });

    const result = await sendCommunication({
      communicationId: "comm-1",
      organisationId: "org-1",
      filters: {},
      slug: "test-org",
    });

    expect(result.success).toBe(true);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/actions/communications/__tests__/send.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement sendCommunication**

Create `src/actions/communications/send.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import {
  communications,
  communicationRecipients,
  organisations,
  members,
  organisationMembers,
  membershipClasses,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { sendEmailTracked } from "@/lib/email/send";
import { sendSMS } from "@/lib/sms/send";
import { renderMarkdown } from "@/lib/markdown";
import { BulkCommunicationEmail } from "@/lib/email/templates/bulk-communication";
import React from "react";
import type { CommunicationFilters } from "@/db/schema/communications";

type SendInput = {
  communicationId: string;
  organisationId: string;
  filters: CommunicationFilters;
  slug: string;
};

type SendResult = {
  success: boolean;
  sent?: number;
  failed?: number;
  error?: string;
};

const BATCH_SIZE = 50;

export async function sendCommunication(input: SendInput): Promise<SendResult> {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  // Fetch the communication
  const [comm] = await db
    .select()
    .from(communications)
    .where(
      and(
        eq(communications.id, input.communicationId),
        eq(communications.organisationId, input.organisationId)
      )
    );

  if (!comm) return { success: false, error: "Communication not found" };
  if (comm.status !== "DRAFT") return { success: false, error: "Only drafts can be sent" };

  // Fetch org details
  const [org] = await db
    .select({
      name: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
      smsFromNumber: organisations.smsFromNumber,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  if (!org) return { success: false, error: "Organisation not found" };

  // Resolve recipients
  const conditions = [
    eq(members.organisationId, input.organisationId),
    eq(organisationMembers.isActive, true),
  ];

  const recipientRows = await db
    .select({
      id: members.id,
      email: members.email,
      phone: members.phone,
      firstName: members.firstName,
      lastName: members.lastName,
      membershipClassName: membershipClasses.name,
    })
    .from(members)
    .innerJoin(
      organisationMembers,
      and(
        eq(organisationMembers.memberId, members.id),
        eq(organisationMembers.organisationId, input.organisationId)
      )
    )
    .leftJoin(membershipClasses, eq(membershipClasses.id, members.membershipClassId))
    .where(and(...conditions))
    .orderBy(members.lastName, members.firstName);

  // Apply manual exclude
  let filtered = recipientRows;
  if (input.filters?.manualExclude?.length) {
    const excludeSet = new Set(input.filters.manualExclude);
    filtered = filtered.filter((r) => !excludeSet.has(r.id));
  }

  if (filtered.length === 0) {
    return { success: false, error: "No recipients to send to" };
  }

  // Set status to SENDING
  await db
    .update(communications)
    .set({ status: "SENDING", updatedAt: new Date() })
    .where(eq(communications.id, comm.id));

  // Build recipient rows
  const recipientInserts: Array<{
    communicationId: string;
    memberId: string;
    channel: "EMAIL" | "SMS";
  }> = [];

  for (const member of filtered) {
    const shouldEmail = (comm.channel === "EMAIL" || comm.channel === "BOTH") && member.email;
    const shouldSms = (comm.channel === "SMS" || comm.channel === "BOTH") && member.phone;

    if (shouldEmail) {
      recipientInserts.push({ communicationId: comm.id, memberId: member.id, channel: "EMAIL" });
    }
    if (shouldSms) {
      recipientInserts.push({ communicationId: comm.id, memberId: member.id, channel: "SMS" });
    }
  }

  // Insert all recipient rows
  const insertedRecipients = await db
    .insert(communicationRecipients)
    .values(recipientInserts)
    .returning();

  // Render markdown for email (sanitized via DOMPurify inside renderMarkdown)
  const bodyHtml = renderMarkdown(comm.bodyMarkdown);

  // Send in batches
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < insertedRecipients.length; i += BATCH_SIZE) {
    const batch = insertedRecipients.slice(i, i + BATCH_SIZE);

    for (const recipient of batch) {
      const member = filtered.find((m) => m.id === recipient.memberId);
      if (!member) continue;

      if (recipient.channel === "EMAIL") {
        const result = await sendEmailTracked({
          to: member.email,
          subject: comm.subject || "(No subject)",
          template: React.createElement(BulkCommunicationEmail, {
            orgName: org.name,
            bodyHtml,
            logoUrl: org.logoUrl || undefined,
          }),
          replyTo: org.contactEmail || undefined,
          orgName: org.name,
        });

        if (result.messageId) {
          await db
            .update(communicationRecipients)
            .set({ status: "SENT", externalId: result.messageId, sentAt: new Date() })
            .where(eq(communicationRecipients.id, recipient.id));
          sent++;
        } else {
          await db
            .update(communicationRecipients)
            .set({ status: "FAILED", error: result.error || "Unknown error" })
            .where(eq(communicationRecipients.id, recipient.id));
          failed++;
        }
      } else if (recipient.channel === "SMS") {
        if (!org.smsFromNumber) {
          await db
            .update(communicationRecipients)
            .set({ status: "FAILED", error: "No SMS from number configured" })
            .where(eq(communicationRecipients.id, recipient.id));
          failed++;
          continue;
        }

        const result = await sendSMS({
          to: member.phone!,
          body: comm.smsBody || comm.bodyMarkdown.replace(/[#*_`]/g, "").substring(0, 1600),
          from: org.smsFromNumber,
        });

        if (result.messageId) {
          await db
            .update(communicationRecipients)
            .set({ status: "SENT", externalId: result.messageId, sentAt: new Date() })
            .where(eq(communicationRecipients.id, recipient.id));
          sent++;
        } else {
          await db
            .update(communicationRecipients)
            .set({ status: "FAILED", error: result.error || "Unknown error" })
            .where(eq(communicationRecipients.id, recipient.id));
          failed++;
        }
      }
    }
  }

  // Final status
  const finalStatus = failed === 0 ? "SENT" : sent === 0 ? "FAILED" : "PARTIAL_FAILURE";

  await db
    .update(communications)
    .set({
      status: finalStatus,
      recipientCount: sent + failed,
      sentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(communications.id, comm.id));

  revalidatePath(`/${input.slug}/admin/communications`);
  return { success: true, sent, failed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/actions/communications/__tests__/send.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/communications/
git commit -m "feat(phase-15): add sendCommunication action with batch email and SMS"
```

---

### Task 13: Server action — List and get communications

**Files:**
- Create: `src/actions/communications/queries.ts`
- Create: `src/actions/communications/__tests__/queries.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/communications/__tests__/queries.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            leftJoin: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: () => ({
                    offset: () => [
                      {
                        id: "comm-1",
                        subject: "Test",
                        channel: "EMAIL",
                        status: "SENT",
                        recipientCount: 10,
                        sentAt: new Date(),
                        createdByFirstName: "Alice",
                        createdByLastName: "Smith",
                      },
                    ],
                  }),
                }),
              }),
            }),
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return [{
                id: "comm-1",
                subject: "Test",
                channel: "EMAIL",
                status: "SENT",
                bodyMarkdown: "# Hello",
                recipientCount: 10,
                sentAt: new Date(),
              }];
            },
            innerJoin: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: () => ({
                    offset: () => [],
                  }),
                }),
              }),
            }),
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  communications: { id: "id", organisationId: "organisationId", status: "status", createdByMemberId: "createdByMemberId" },
  communicationRecipients: { id: "id", communicationId: "communicationId", status: "status" },
  members: { id: "id", firstName: "firstName", lastName: "lastName" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn().mockReturnValue("count"),
}));

import { listCommunications, getCommunication } from "../queries";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listCommunications", () => {
  it("returns paginated communications for the org", async () => {
    const result = await listCommunications("org-1");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({ id: "comm-1", subject: "Test" })
    );
  });
});

describe("getCommunication", () => {
  it("returns a single communication with details", async () => {
    const result = await getCommunication("comm-1", "org-1");
    expect(result).toEqual(
      expect.objectContaining({ id: "comm-1" })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/actions/communications/__tests__/queries.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement list and get queries**

Create `src/actions/communications/queries.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { communications, communicationRecipients, members } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

const PAGE_SIZE = 25;

export async function listCommunications(
  organisationId: string,
  filters?: { status?: string; page?: number }
) {
  const page = filters?.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [eq(communications.organisationId, organisationId)];

  if (filters?.status) {
    conditions.push(
      eq(communications.status, filters.status as "DRAFT" | "SENDING" | "SENT" | "PARTIAL_FAILURE" | "FAILED")
    );
  }

  return db
    .select({
      id: communications.id,
      subject: communications.subject,
      channel: communications.channel,
      status: communications.status,
      recipientCount: communications.recipientCount,
      sentAt: communications.sentAt,
      createdAt: communications.createdAt,
      createdByFirstName: members.firstName,
      createdByLastName: members.lastName,
    })
    .from(communications)
    .leftJoin(members, eq(members.id, communications.createdByMemberId))
    .where(and(...conditions))
    .orderBy(desc(communications.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);
}

export async function getCommunication(communicationId: string, organisationId: string) {
  const [comm] = await db
    .select()
    .from(communications)
    .where(
      and(
        eq(communications.id, communicationId),
        eq(communications.organisationId, organisationId)
      )
    );

  return comm ?? null;
}

export async function getRecipientStats(communicationId: string) {
  const rows = await db
    .select({
      status: communicationRecipients.status,
      count: sql<number>`count(*)::int`,
    })
    .from(communicationRecipients)
    .where(eq(communicationRecipients.communicationId, communicationId))
    .groupBy(communicationRecipients.status);

  const stats: Record<string, number> = {};
  for (const row of rows) {
    stats[row.status] = row.count;
  }
  return stats;
}

export async function getRecipients(communicationId: string, page = 1) {
  const offset = (page - 1) * PAGE_SIZE;

  return db
    .select({
      id: communicationRecipients.id,
      memberId: communicationRecipients.memberId,
      firstName: members.firstName,
      lastName: members.lastName,
      email: members.email,
      phone: members.phone,
      channel: communicationRecipients.channel,
      status: communicationRecipients.status,
      sentAt: communicationRecipients.sentAt,
      deliveredAt: communicationRecipients.deliveredAt,
      openedAt: communicationRecipients.openedAt,
      error: communicationRecipients.error,
    })
    .from(communicationRecipients)
    .innerJoin(members, eq(members.id, communicationRecipients.memberId))
    .where(eq(communicationRecipients.communicationId, communicationId))
    .orderBy(members.lastName, members.firstName)
    .limit(PAGE_SIZE)
    .offset(offset);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/actions/communications/__tests__/queries.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/communications/
git commit -m "feat(phase-15): add communication list, get, and recipient stats queries"
```

---

### Task 14: Server action — Retry failed + SMS settings

**Files:**
- Create: `src/actions/communications/retry-failed.ts`
- Create: `src/actions/communications/settings.ts`
- Create: `src/actions/communications/__tests__/retry-failed.test.ts`
- Create: `src/actions/communications/__tests__/settings.test.ts`

- [ ] **Step 1: Write the retry-failed test**

Create `src/actions/communications/__tests__/retry-failed.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            innerJoin: () => ({
              where: () => [
                { id: "rec-1", memberId: "m1", channel: "EMAIL", email: "alice@test.com", phone: null, firstName: "Alice" },
              ],
            }),
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              const callCount = mockWhere.mock.calls.length;
              if (callCount === 1) {
                return [{ id: "comm-1", channel: "EMAIL", subject: "Test", bodyMarkdown: "# Hello", smsBody: null, organisationId: "org-1" }];
              }
              return [{ name: "Test Org", contactEmail: "c@test.com", logoUrl: null, smsFromNumber: null }];
            },
          };
        },
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return { where: () => ({}) };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  communications: { id: "id", organisationId: "organisationId" },
  communicationRecipients: { id: "id", communicationId: "communicationId", status: "status" },
  organisations: { id: "id" },
  members: { id: "id", email: "email", phone: "phone" },
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  isCommitteeOrAbove: vi.fn().mockReturnValue(true),
}));

const mockSendEmailTracked = vi.fn().mockResolvedValue({ messageId: "resend-456" });
vi.mock("@/lib/email/send", () => ({
  sendEmailTracked: (...args: unknown[]) => mockSendEmailTracked(...args),
}));
vi.mock("@/lib/email/templates/bulk-communication", () => ({
  BulkCommunicationEmail: vi.fn(),
}));
vi.mock("@/lib/markdown", () => ({
  renderMarkdown: vi.fn().mockReturnValue("<h1>Hello</h1>"),
}));
vi.mock("@/lib/sms/send", () => ({
  sendSMS: vi.fn().mockResolvedValue({ messageId: "telnyx-456" }),
}));

import { retryFailed } from "../retry-failed";

beforeEach(() => { vi.clearAllMocks(); });

describe("retryFailed", () => {
  it("retries sending to failed recipients", async () => {
    const result = await retryFailed({
      communicationId: "comm-1",
      organisationId: "org-1",
      slug: "test-org",
    });

    expect(result.success).toBe(true);
    expect(result.retried).toBe(1);
    expect(mockSendEmailTracked).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Write the settings test**

Create `src/actions/communications/__tests__/settings.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return { where: () => ({}) };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({ organisations: { id: "id" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  isAdmin: vi.fn().mockReturnValue(true),
}));

import { updateSmsSettings } from "../settings";

beforeEach(() => { vi.clearAllMocks(); });

describe("updateSmsSettings", () => {
  it("updates SMS settings for the org", async () => {
    const result = await updateSmsSettings({
      organisationId: "org-1",
      smsPreArrivalEnabled: true,
      smsPreArrivalHours: 48,
      smsPaymentReminderEnabled: false,
      slug: "test-org",
    });

    expect(result.success).toBe(true);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        smsPreArrivalEnabled: true,
        smsPreArrivalHours: 48,
      })
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/actions/communications/__tests__/retry-failed.test.ts src/actions/communications/__tests__/settings.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 4: Implement retryFailed**

Create `src/actions/communications/retry-failed.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { communications, communicationRecipients, organisations, members } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { sendEmailTracked } from "@/lib/email/send";
import { sendSMS } from "@/lib/sms/send";
import { renderMarkdown } from "@/lib/markdown";
import { BulkCommunicationEmail } from "@/lib/email/templates/bulk-communication";
import React from "react";

type RetryInput = {
  communicationId: string;
  organisationId: string;
  slug: string;
  recipientId?: string;
};

export async function retryFailed(input: RetryInput) {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  const [comm] = await db
    .select()
    .from(communications)
    .where(
      and(
        eq(communications.id, input.communicationId),
        eq(communications.organisationId, input.organisationId)
      )
    );

  if (!comm) return { success: false, error: "Communication not found" };

  const [org] = await db
    .select({
      name: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
      smsFromNumber: organisations.smsFromNumber,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  if (!org) return { success: false, error: "Organisation not found" };

  const failedConditions = [
    eq(communicationRecipients.communicationId, input.communicationId),
    eq(communicationRecipients.status, "FAILED"),
  ];

  if (input.recipientId) {
    failedConditions.push(eq(communicationRecipients.id, input.recipientId));
  }

  const failedRecipients = await db
    .select({
      id: communicationRecipients.id,
      memberId: communicationRecipients.memberId,
      channel: communicationRecipients.channel,
      email: members.email,
      phone: members.phone,
      firstName: members.firstName,
    })
    .from(communicationRecipients)
    .innerJoin(members, eq(members.id, communicationRecipients.memberId))
    .where(and(...failedConditions));

  const bodyHtml = renderMarkdown(comm.bodyMarkdown);
  let retried = 0;

  for (const recipient of failedRecipients) {
    if (recipient.channel === "EMAIL") {
      const result = await sendEmailTracked({
        to: recipient.email,
        subject: comm.subject || "(No subject)",
        template: React.createElement(BulkCommunicationEmail, {
          orgName: org.name,
          bodyHtml,
          logoUrl: org.logoUrl || undefined,
        }),
        replyTo: org.contactEmail || undefined,
        orgName: org.name,
      });

      if (result.messageId) {
        await db
          .update(communicationRecipients)
          .set({ status: "SENT", externalId: result.messageId, sentAt: new Date(), error: null })
          .where(eq(communicationRecipients.id, recipient.id));
        retried++;
      } else {
        await db
          .update(communicationRecipients)
          .set({ error: result.error || "Retry failed" })
          .where(eq(communicationRecipients.id, recipient.id));
      }
    } else if (recipient.channel === "SMS" && org.smsFromNumber) {
      const result = await sendSMS({
        to: recipient.phone!,
        body: comm.smsBody || comm.bodyMarkdown.replace(/[#*_`]/g, "").substring(0, 1600),
        from: org.smsFromNumber,
      });

      if (result.messageId) {
        await db
          .update(communicationRecipients)
          .set({ status: "SENT", externalId: result.messageId, sentAt: new Date(), error: null })
          .where(eq(communicationRecipients.id, recipient.id));
        retried++;
      } else {
        await db
          .update(communicationRecipients)
          .set({ error: result.error || "Retry failed" })
          .where(eq(communicationRecipients.id, recipient.id));
      }
    }
  }

  revalidatePath(`/${input.slug}/admin/communications/${input.communicationId}`);
  return { success: true, retried };
}
```

- [ ] **Step 5: Implement updateSmsSettings**

Create `src/actions/communications/settings.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, isAdmin } from "@/lib/auth";

type SmsSettingsInput = {
  organisationId: string;
  smsPreArrivalEnabled: boolean;
  smsPreArrivalHours: number;
  smsPaymentReminderEnabled: boolean;
  slug: string;
};

export async function updateSmsSettings(input: SmsSettingsInput) {
  const session = await getSessionMember(input.organisationId);
  if (!session || !isAdmin(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  await db
    .update(organisations)
    .set({
      smsPreArrivalEnabled: input.smsPreArrivalEnabled,
      smsPreArrivalHours: input.smsPreArrivalHours,
      smsPaymentReminderEnabled: input.smsPaymentReminderEnabled,
      updatedAt: new Date(),
    })
    .where(eq(organisations.id, input.organisationId));

  revalidatePath(`/${input.slug}/admin/communications`);
  return { success: true };
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/actions/communications/__tests__/retry-failed.test.ts src/actions/communications/__tests__/settings.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/actions/communications/
git commit -m "feat(phase-15): add retryFailed and updateSmsSettings actions"
```

---

### Task 15: Webhook handlers and routes

**Files:**
- Create: `src/actions/communications/webhook-handlers.ts`
- Create: `src/app/api/webhooks/resend/route.ts`
- Create: `src/app/api/webhooks/telnyx/route.ts`
- Create: `src/actions/communications/__tests__/webhook-handlers.test.ts`

- [ ] **Step 1: Write webhook handler tests**

Create `src/actions/communications/__tests__/webhook-handlers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return {};
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  communicationRecipients: { id: "id", externalId: "externalId", status: "status" },
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { processResendWebhook, processTelnyxWebhook } from "../webhook-handlers";

beforeEach(() => { vi.clearAllMocks(); });

describe("processResendWebhook", () => {
  it("updates recipient to DELIVERED on email.delivered", async () => {
    await processResendWebhook({ type: "email.delivered", data: { email_id: "resend-123" } });
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: "DELIVERED" }));
  });

  it("updates recipient to OPENED on email.opened", async () => {
    await processResendWebhook({ type: "email.opened", data: { email_id: "resend-123" } });
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: "OPENED" }));
  });

  it("updates recipient to BOUNCED on email.bounced", async () => {
    await processResendWebhook({ type: "email.bounced", data: { email_id: "resend-123" } });
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: "BOUNCED" }));
  });

  it("ignores unknown event types", async () => {
    await processResendWebhook({ type: "email.unknown", data: { email_id: "resend-123" } });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("processTelnyxWebhook", () => {
  it("updates recipient to DELIVERED on message.delivered", async () => {
    await processTelnyxWebhook({ data: { event_type: "message.delivered", payload: { id: "telnyx-123" } } });
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: "DELIVERED" }));
  });

  it("updates recipient to FAILED on message.failed", async () => {
    await processTelnyxWebhook({ data: { event_type: "message.failed", payload: { id: "telnyx-123" } } });
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: "FAILED" }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/actions/communications/__tests__/webhook-handlers.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create webhook handlers**

Create `src/actions/communications/webhook-handlers.ts`:

```typescript
import { db } from "@/db/index";
import { communicationRecipients } from "@/db/schema";
import { eq } from "drizzle-orm";

type ResendWebhookPayload = {
  type: string;
  data: { email_id: string };
};

type TelnyxWebhookPayload = {
  data: {
    event_type: string;
    payload: { id: string };
  };
};

export async function processResendWebhook(payload: ResendWebhookPayload) {
  const { type, data } = payload;
  const externalId = data.email_id;

  const statusMap: Record<string, { status: string; field?: string }> = {
    "email.delivered": { status: "DELIVERED", field: "deliveredAt" },
    "email.opened": { status: "OPENED", field: "openedAt" },
    "email.clicked": { status: "CLICKED" },
    "email.bounced": { status: "BOUNCED" },
    "email.complaint": { status: "BOUNCED" },
  };

  const mapping = statusMap[type];
  if (!mapping) return;

  const updates: Record<string, unknown> = {
    status: mapping.status as "DELIVERED" | "OPENED" | "CLICKED" | "BOUNCED",
  };

  if (mapping.field) {
    updates[mapping.field] = new Date();
  }

  await db
    .update(communicationRecipients)
    .set(updates)
    .where(eq(communicationRecipients.externalId, externalId));
}

export async function processTelnyxWebhook(payload: TelnyxWebhookPayload) {
  const eventType = payload.data.event_type;
  const externalId = payload.data.payload.id;

  const statusMap: Record<string, string> = {
    "message.sent": "SENT",
    "message.delivered": "DELIVERED",
    "message.failed": "FAILED",
  };

  const status = statusMap[eventType];
  if (!status) return;

  const updates: Record<string, unknown> = {
    status: status as "SENT" | "DELIVERED" | "FAILED",
  };

  if (status === "DELIVERED") {
    updates.deliveredAt = new Date();
  }

  await db
    .update(communicationRecipients)
    .set(updates)
    .where(eq(communicationRecipients.externalId, externalId));
}
```

- [ ] **Step 4: Create Resend webhook route**

Create `src/app/api/webhooks/resend/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { processResendWebhook } from "@/actions/communications/webhook-handlers";

export async function POST(request: NextRequest): Promise<Response> {
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing webhook headers", { status: 400 });
  }

  const body = await request.json();

  try {
    await processResendWebhook(body);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[webhook/resend] Error:", error);
    return new Response("Internal error", { status: 500 });
  }
}
```

- [ ] **Step 5: Create Telnyx webhook route**

Create `src/app/api/webhooks/telnyx/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { processTelnyxWebhook } from "@/actions/communications/webhook-handlers";

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json();

  try {
    await processTelnyxWebhook(body);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[webhook/telnyx] Error:", error);
    return new Response("Internal error", { status: 500 });
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run src/actions/communications/__tests__/webhook-handlers.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/actions/communications/webhook-handlers.ts src/app/api/webhooks/resend/ src/app/api/webhooks/telnyx/
git commit -m "feat(phase-15): add Resend and Telnyx webhook handlers and routes"
```

---

### Task 16: Extend booking cron — SMS pre-arrival reminders

**Files:**
- Modify: `src/actions/bookings/cron.ts`

- [ ] **Step 1: Add SMS import and pre-arrival logic**

In `src/actions/bookings/cron.ts`, add import at top:

```typescript
import { sendSMS } from "@/lib/sms/send";
```

Add `preArrivalSmsSent: number` to `BookingPaymentCronResult`.

After Pass 2 (auto-cancel) and before Pass 3 (hold cleanup), add:

```typescript
// ─── Pass 2.5: Pre-Arrival SMS Reminders ──────────────────────────────

let preArrivalSmsSent = 0;

const upcomingBookings = await db
  .select({
    bookingId: bookings.id,
    checkInDate: bookings.checkInDate,
    memberFirstName: members.firstName,
    memberPhone: members.phone,
    lodgeName: lodges.name,
    orgName: organisations.name,
    smsFromNumber: organisations.smsFromNumber,
    smsPreArrivalEnabled: organisations.smsPreArrivalEnabled,
    smsPreArrivalHours: organisations.smsPreArrivalHours,
  })
  .from(bookings)
  .innerJoin(organisations, eq(organisations.id, bookings.organisationId))
  .innerJoin(members, eq(members.id, bookings.primaryMemberId))
  .innerJoin(lodges, eq(lodges.id, bookings.lodgeId))
  .where(
    and(
      eq(bookings.status, "CONFIRMED"),
      eq(organisations.smsPreArrivalEnabled, true),
    )
  );

for (const booking of upcomingBookings) {
  if (!booking.memberPhone || !booking.smsFromNumber) continue;

  const hoursUntilCheckIn =
    (new Date(booking.checkInDate + "T00:00:00").getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursUntilCheckIn > 0 && hoursUntilCheckIn <= (booking.smsPreArrivalHours ?? 24)) {
    await sendSMS({
      to: booking.memberPhone,
      body: `Hi ${booking.memberFirstName}, reminder: your stay at ${booking.lodgeName} starts ${booking.checkInDate}. See you soon! — ${booking.orgName}`,
      from: booking.smsFromNumber,
    });
    preArrivalSmsSent++;
  }
}
```

Update the return statement to include `preArrivalSmsSent`.

- [ ] **Step 2: Run existing cron tests to ensure no regression**

```bash
npx vitest run src/actions/bookings/__tests__/cron.test.ts
```

Expected: PASS (new query is independent of existing logic).

- [ ] **Step 3: Commit**

```bash
git add src/actions/bookings/cron.ts
git commit -m "feat(phase-15): add SMS pre-arrival reminders to booking payment cron"
```

---

### Task 17: Communications page — Server component + Messages tab

**Files:**
- Create: `src/app/[slug]/admin/communications/page.tsx`
- Create: `src/app/[slug]/admin/communications/communications-table.tsx`

- [ ] **Step 1: Create the server page**

Create `src/app/[slug]/admin/communications/page.tsx`:

```typescript
import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { listCommunications } from "@/actions/communications/queries";
import { listTemplates } from "@/actions/communications/templates";
import { CommunicationsTable } from "./communications-table";
import { TemplatesGrid } from "./templates-grid";
import { SmsSettingsForm } from "./sms-settings-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function AdminCommunicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; status?: string; page?: string }>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session || !isCommitteeOrAbove(session.role)) notFound();

  const activeTab = search.tab || "messages";

  const comms = await listCommunications(org.id, {
    status: search.status,
    page: search.page ? parseInt(search.page) : 1,
  });

  const templates = await listTemplates(org.id);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Communications</h1>
        <Link href={`/${slug}/admin/communications/compose`}>
          <Button>Compose</Button>
        </Link>
      </div>

      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          {session.role === "ADMIN" && (
            <TabsTrigger value="settings">Settings</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="messages" className="mt-4">
          <CommunicationsTable communications={comms} slug={slug} />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <TemplatesGrid
            templates={templates}
            organisationId={org.id}
            slug={slug}
            sessionMemberId={session.memberId}
          />
        </TabsContent>

        {session.role === "ADMIN" && (
          <TabsContent value="settings" className="mt-4">
            <SmsSettingsForm
              organisationId={org.id}
              slug={slug}
              smsFromNumber={org.smsFromNumber}
              smsPreArrivalEnabled={org.smsPreArrivalEnabled}
              smsPreArrivalHours={org.smsPreArrivalHours}
              smsPaymentReminderEnabled={org.smsPaymentReminderEnabled}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Create the communications table**

Create `src/app/[slug]/admin/communications/communications-table.tsx`:

```typescript
"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

type Communication = {
  id: string;
  subject: string | null;
  channel: string;
  status: string;
  recipientCount: number | null;
  sentAt: Date | null;
  createdAt: Date;
  createdByFirstName: string | null;
  createdByLastName: string | null;
};

type Props = {
  communications: Communication[];
  slug: string;
};

const STATUS_BADGE: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  DRAFT: "outline",
  SENDING: "secondary",
  SENT: "default",
  PARTIAL_FAILURE: "destructive",
  FAILED: "destructive",
};

const CHANNEL_BADGE: Record<string, "default" | "secondary" | "outline"> = {
  EMAIL: "default",
  SMS: "secondary",
  BOTH: "outline",
};

export function CommunicationsTable({ communications, slug }: Props) {
  if (communications.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No communications yet. Click &quot;Compose&quot; to send your first message.
      </p>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Subject</th>
              <th className="px-4 py-3 text-left font-medium">Channel</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Recipients</th>
              <th className="px-4 py-3 text-left font-medium">Sent By</th>
              <th className="px-4 py-3 text-left font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {communications.map((comm) => (
              <tr key={comm.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link
                    href={`/${slug}/admin/communications/${comm.id}`}
                    className="font-medium hover:underline"
                  >
                    {comm.subject || "(No subject)"}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={CHANNEL_BADGE[comm.channel] || "outline"}>
                    {comm.channel}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_BADGE[comm.status] || "outline"}>
                    {comm.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">{comm.recipientCount ?? "—"}</td>
                <td className="px-4 py-3">
                  {comm.createdByFirstName} {comm.createdByLastName}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDistanceToNow(comm.sentAt || comm.createdAt, { addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {communications.map((comm) => (
          <Link
            key={comm.id}
            href={`/${slug}/admin/communications/${comm.id}`}
            className="block rounded-md border p-4 hover:bg-muted/30"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{comm.subject || "(No subject)"}</span>
              <Badge variant={STATUS_BADGE[comm.status] || "outline"} className="text-xs">
                {comm.status}
              </Badge>
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <Badge variant={CHANNEL_BADGE[comm.channel] || "outline"} className="text-xs">
                {comm.channel}
              </Badge>
              <span>{comm.recipientCount ?? 0} recipients</span>
              <span>{formatDistanceToNow(comm.sentAt || comm.createdAt, { addSuffix: true })}</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\[slug\]/admin/communications/page.tsx src/app/\[slug\]/admin/communications/communications-table.tsx
git commit -m "feat(phase-15): add communications page with messages table"
```

---

### Task 18: Templates grid component

**Files:**
- Create: `src/app/[slug]/admin/communications/templates-grid.tsx`

- [ ] **Step 1: Create the templates grid**

Create `src/app/[slug]/admin/communications/templates-grid.tsx`. This component shows a card grid of templates with create dialog and delete. Uses `createTemplate` and `deleteTemplate` actions, `Dialog` + `Select` + `Textarea` from shadcn/ui, `toast` from sonner, `formatDistanceToNow` from date-fns. Each card shows name, channel badge, updated date, and "Use" (navigates to compose with `?template={id}`) and "Delete" buttons.

The implementer should follow the pattern from `bulk-charge-dialog.tsx` for the dialog form (controlled state, form submit, toast feedback) and the card layout from the existing templates in the codebase. The full component code is in the spec — reference the design doc at `docs/superpowers/specs/2026-04-07-phase-15-bulk-communications-design.md` for details.

- [ ] **Step 2: Commit**

```bash
git add src/app/\[slug\]/admin/communications/templates-grid.tsx
git commit -m "feat(phase-15): add templates grid with create and delete"
```

---

### Task 19: SMS settings form

**Files:**
- Create: `src/app/[slug]/admin/communications/sms-settings-form.tsx`

- [ ] **Step 1: Create the settings form**

Create `src/app/[slug]/admin/communications/sms-settings-form.tsx`. Client component with:
- SMS phone number display (read-only)
- Checkbox + number input for pre-arrival SMS (enabled toggle + hours)
- Checkbox for payment reminder SMS
- Save button calling `updateSmsSettings` action
- Follow existing form patterns: `useState` for each field, `toast.success`/`toast.error` feedback

- [ ] **Step 2: Commit**

```bash
git add src/app/\[slug\]/admin/communications/sms-settings-form.tsx
git commit -m "feat(phase-15): add SMS settings form for automated triggers"
```

---

### Task 20: Compose page with markdown editor and recipient filters

**Files:**
- Create: `src/app/[slug]/admin/communications/compose/page.tsx`
- Create: `src/app/[slug]/admin/communications/compose/compose-form.tsx`

- [ ] **Step 1: Create the compose server page**

Create `src/app/[slug]/admin/communications/compose/page.tsx`. Async server component that:
- Resolves org and session (notFound if missing or unauthorized)
- Loads draft if `?draft={id}` query param present
- Loads template if `?template={id}` query param present
- Fetches membership classes and seasons for filter dropdowns
- Renders `ComposeForm` with all data as props

- [ ] **Step 2: Create the compose form client component**

Create `src/app/[slug]/admin/communications/compose/compose-form.tsx`. Large client component with:

**State:** channel, subject, bodyMarkdown, smsBody, templateName, filters (CommunicationFilters), recipients list, excluded set, counts, loading/saving/sending states, draftId, preview modal.

**Sections (top to bottom):**
1. Channel selector — three buttons (EMAIL/SMS/BOTH)
2. Subject input — visible for EMAIL/BOTH
3. Email body — markdown textarea + live preview (sanitized via `renderMarkdown`, displayed with `dangerouslySetInnerHTML`). Side-by-side on desktop, single on mobile.
4. SMS body — plain text textarea with character/segment counter. Visible for SMS/BOTH.
5. Recipient filters — Select dropdowns for membership class, financial status, role. `useEffect` calls `resolveRecipients` when filters change. Shows member list with checkboxes, Select All/None. Badge showing count.
6. Template name input — optional, for "Save as Template"
7. Action bar (sticky bottom) — Save Draft, Preview, Send buttons

**Key interactions:**
- Save Draft: calls `createDraft` or `updateDraft`
- Preview: opens Dialog showing sanitized HTML + SMS preview
- Send: saves as draft first if needed, then calls `sendCommunication`, redirects to list on success

All HTML rendered from markdown MUST use `renderMarkdown()` which sanitizes via DOMPurify.

- [ ] **Step 3: Commit**

```bash
git add src/app/\[slug\]/admin/communications/compose/
git commit -m "feat(phase-15): add compose page with markdown editor and recipient filters"
```

---

### Task 21: Message detail page with delivery stats

**Files:**
- Create: `src/app/[slug]/admin/communications/[id]/page.tsx`
- Create: `src/app/[slug]/admin/communications/[id]/message-detail.tsx`

- [ ] **Step 1: Create the server page**

Create `src/app/[slug]/admin/communications/[id]/page.tsx`. Loads communication, recipient stats, and recipients list. Passes all to `MessageDetail`.

- [ ] **Step 2: Create the detail client component**

Create `src/app/[slug]/admin/communications/[id]/message-detail.tsx`. Shows:
- Header with subject, status/channel badges, sent date
- Delivery stats cards row: Sent, Delivered, Opened, Bounced, Failed (count + percentage)
- Message content preview (sanitized markdown via `renderMarkdown` + `dangerouslySetInnerHTML`)
- SMS body if present
- Recipients table (desktop: table with member, contact, channel, status, timestamps, resend action; mobile: cards)
- "Retry Failed" button calling `retryFailed` action
- Per-recipient "Resend" button for FAILED rows

All HTML rendered from markdown MUST use `renderMarkdown()` which sanitizes via DOMPurify.

- [ ] **Step 3: Commit**

```bash
git add src/app/\[slug\]/admin/communications/\[id\]/
git commit -m "feat(phase-15): add message detail page with delivery stats and recipient table"
```

---

### Task 22: Run all tests and fix issues

- [ ] **Step 1: Run all communication tests**

```bash
npx vitest run src/actions/communications/ src/lib/sms/ src/lib/__tests__/markdown.test.ts src/lib/email/__tests__/send.test.ts src/lib/email/templates/__tests__/
```

Expected: All PASS.

- [ ] **Step 2: Run the full test suite**

```bash
npx vitest run
```

Expected: All existing tests still pass.

- [ ] **Step 3: Fix any failing tests**

Address import path mismatches, mock shape issues, or type errors from new schema columns.

- [ ] **Step 4: Commit fixes if any**

```bash
git add -A
git commit -m "fix(phase-15): fix test issues from integration"
```

---

### Task 23: E2E tests

**Files:**
- Create: `e2e/tests/admin-communications.spec.ts`

- [ ] **Step 1: Create the E2E spec**

Create `e2e/tests/admin-communications.spec.ts`:

```typescript
import { test, expect } from "../fixtures/auth";

test.describe("Admin communications", () => {
  test("communications page loads with tabs", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/communications");
    await expect(adminPage.getByRole("heading", { name: "Communications" })).toBeVisible();
    await expect(adminPage.getByRole("tab", { name: "Messages" })).toBeVisible();
    await expect(adminPage.getByRole("tab", { name: "Templates" })).toBeVisible();
    await expect(adminPage.getByRole("tab", { name: "Settings" })).toBeVisible();
  });

  test("compose page loads with channel selector", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/communications/compose");
    await expect(adminPage.getByRole("heading", { name: "Compose Message" })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "EMAIL" })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "SMS" })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "BOTH" })).toBeVisible();
  });

  test("compose shows markdown editor and recipient filters", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/communications/compose");
    await expect(adminPage.getByPlaceholder("Write your message in markdown")).toBeVisible();
    await expect(adminPage.getByPlaceholder("Email subject line")).toBeVisible();
    await expect(adminPage.getByText("Recipients")).toBeVisible();
  });

  test("SMS channel shows character counter", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/communications/compose");
    await adminPage.getByRole("button", { name: "SMS" }).click();
    await expect(adminPage.getByPlaceholder("Plain text SMS message")).toBeVisible();
    await expect(adminPage.getByText(/\/160/)).toBeVisible();
  });

  test("templates tab shows empty state", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/communications?tab=templates");
    await adminPage.getByRole("tab", { name: "Templates" }).click();
    await expect(adminPage.getByText("No templates yet")).toBeVisible();
  });

  test("settings tab shows SMS configuration", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/communications?tab=settings");
    await adminPage.getByRole("tab", { name: "Settings" }).click();
    await expect(adminPage.getByText("SMS Phone Number")).toBeVisible();
    await expect(adminPage.getByText("Automated SMS Triggers")).toBeVisible();
  });

  test("booking officer cannot access communications", async ({ officerPage }) => {
    await officerPage.goto("/polski/admin/communications");
    await expect(officerPage.getByRole("heading", { name: "Communications" })).not.toBeVisible();
  });

  test("recipient list loads with members", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/communications/compose");
    await adminPage.waitForTimeout(1000);
    await expect(adminPage.getByText(/Sending to \d+ member/)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
npx playwright test e2e/tests/admin-communications.spec.ts --reporter=list
```

Expected: Tests pass.

- [ ] **Step 3: Fix any failing tests and commit**

```bash
git add e2e/tests/admin-communications.spec.ts
git commit -m "test(phase-15): add E2E tests for communications page"
```

---

### Task 24: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Phase 15 section**

Add to README documenting:
- Bulk communications (email + SMS via Telnyx)
- Compose with markdown editor + live preview
- Reusable templates
- Recipient filtering with manual override
- Delivery tracking via Resend and Telnyx webhooks
- Automated SMS triggers (pre-arrival, payment reminder)
- New env vars: `TELNYX_API_KEY`, `RESEND_WEBHOOK_SECRET`

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README with Phase 15 bulk communications"
```
