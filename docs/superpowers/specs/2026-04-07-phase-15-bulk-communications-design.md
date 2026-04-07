# Phase 15 — Bulk Communications (Email + SMS)

Compose and send targeted communications to filtered member lists via email and SMS. Includes reusable templates, draft management, delivery tracking, and automated SMS triggers.

---

## Data Model

### New Tables

#### `communication_templates`

Reusable message templates that can be loaded into the compose UI.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, default random |
| organisationId | uuid | FK organisations, NOT NULL |
| name | varchar(255) | NOT NULL |
| subject | varchar(255) | nullable (not needed for SMS-only) |
| bodyMarkdown | text | NOT NULL — markdown for email, plain text for SMS |
| smsBody | text | nullable — separate SMS body when channel is BOTH |
| channel | enum('EMAIL', 'SMS', 'BOTH') | NOT NULL |
| createdByMemberId | uuid | FK members, NOT NULL |
| createdAt | timestamp | default now() |
| updatedAt | timestamp | default now() |

#### `communications`

Each composed message — draft or sent.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, default random |
| organisationId | uuid | FK organisations, NOT NULL |
| templateId | uuid | FK communication_templates, nullable |
| subject | varchar(255) | nullable (not needed for SMS-only) |
| bodyMarkdown | text | NOT NULL |
| smsBody | text | nullable — separate SMS body when channel is BOTH |
| channel | enum('EMAIL', 'SMS', 'BOTH') | NOT NULL |
| status | enum('DRAFT', 'SENDING', 'SENT', 'PARTIAL_FAILURE', 'FAILED') | NOT NULL, default DRAFT |
| filters | jsonb | `{ membershipClassIds?: string[], isFinancial?: boolean, seasonId?: string, bookingStatus?: string, role?: string, manualInclude?: string[], manualExclude?: string[] }` |
| recipientCount | integer | total recipients at send time |
| createdByMemberId | uuid | FK members, NOT NULL |
| sentAt | timestamp | nullable |
| createdAt | timestamp | default now() |
| updatedAt | timestamp | default now() |

#### `communication_recipients`

Per-recipient delivery tracking.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, default random |
| communicationId | uuid | FK communications, NOT NULL |
| memberId | uuid | FK members, NOT NULL |
| channel | enum('EMAIL', 'SMS') | NOT NULL — one row per channel when BOTH |
| status | enum('PENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED') | NOT NULL, default PENDING |
| externalId | varchar(255) | Resend message ID or Telnyx message ID |
| sentAt | timestamp | nullable |
| deliveredAt | timestamp | nullable |
| openedAt | timestamp | nullable |
| error | text | nullable — error message on failure |

Indexes: `(communicationId, memberId, channel)` unique, `(externalId)` for webhook lookups.

### Schema Changes to Existing Tables

#### `organisations` — new columns

| Column | Type | Notes |
|---|---|---|
| smsFromNumber | varchar(20) | nullable — Telnyx phone number for this org |
| smsPreArrivalEnabled | boolean | default false |
| smsPreArrivalHours | integer | default 24 — hours before check-in |
| smsPaymentReminderEnabled | boolean | default false |

---

## UI & Pages

### Main Page: `/{slug}/admin/communications`

Committee+ access (`committeeOnly: true` — already in nav).

**Three tabs:** Messages | Templates | Settings

#### Messages Tab

- Table of all communications (drafts + sent)
- Columns: subject, channel (badge), status (badge), recipients count, sent by, sent date
- Status badges: DRAFT (outline), SENDING (yellow), SENT (green), PARTIAL_FAILURE (orange), FAILED (red)
- Filter by status, date range
- "Compose" button top-right
- Mobile: card-based layout (existing pattern)

#### Templates Tab

- Card grid of saved templates
- Each card: name, channel badge, created by, last used date
- Actions: edit, duplicate, delete
- "New Template" button — opens compose page with `?mode=template`

#### Settings Tab

- **SMS Configuration** section:
  - Telnyx phone number display (read-only, set via env/admin)
  - Pre-arrival SMS toggle + hours config input
  - Payment reminder SMS toggle
- Save button updates org settings

### Compose Page: `/{slug}/admin/communications/compose`

Accessible via "Compose" button or "Edit" on a draft. Query params: `?draft={id}`, `?template={id}`, `?mode=template`.

**Layout (top to bottom):**

1. **Channel selector** — segmented control: Email / SMS / Both
2. **Subject field** — shown for Email and Both, hidden for SMS-only
3. **Body editor:**
   - Email: markdown textarea (left) + live HTML preview (right). Desktop side-by-side, mobile tabbed.
   - SMS: plain text textarea with character counter showing `{chars}/160 ({segments} segment(s))`
   - Both: two editors stacked — markdown for email, plain text for SMS
4. **Recipient section:**
   - Filter controls row: membership class (multi-select), financial status (select), season (select), booking status (select), role (select)
   - "Apply Filters" → shows filtered member list below
   - Member list with checkboxes — pre-checked based on filters, manually toggle individual members
   - Count badge: "Sending to X of Y members"
   - Members without email are excluded from email sends; members without phone are excluded from SMS sends — shown as warning counts
5. **Action bar (sticky bottom):**
   - Save Draft / Save as Template / Preview / Send
   - Preview opens modal: email rendered via React Email template, SMS shows plain text
   - Send shows confirmation dialog: "Send {channel} to {count} recipients?"

### Message Detail: `/{slug}/admin/communications/[id]`

- Message content preview (rendered markdown for email, plain text for SMS)
- **Delivery stats cards:** sent, delivered, opened, bounced, failed — with counts and percentages
- **Recipient table:** member name, email/phone, channel, status badge, timestamps (sent, delivered, opened)
- "Retry Failed" button — resends to all FAILED recipients
- "Resend" action per individual recipient

---

## Technical Architecture

### Server Actions

**`src/actions/communications/`:**

| File | Purpose |
|---|---|
| `create-draft.ts` | Create or update a draft communication. Validates channel, subject, body. |
| `send.ts` | Resolve recipients from filters + manual selections, create `communication_recipients` rows, fan out sends in batches of 50. Updates status to SENDING → SENT/PARTIAL_FAILURE/FAILED. |
| `templates.ts` | CRUD for communication templates. |
| `recipients.ts` | Given filter criteria, return matching members with count. Extends `getMembers` patterns with season/booking status filters. |
| `get.ts` | Fetch communication with aggregated recipient stats. |
| `list.ts` | Paginated communications list with status/date filters. |
| `retry-failed.ts` | Re-queue failed recipients for another send attempt. |
| `settings.ts` | Update org SMS trigger columns. |

### Send Flow

1. Validate communication is in DRAFT status
2. Resolve final recipient list (filters + manual overrides)
3. Filter out members missing contact info for the channel (no email → skip email, no phone → skip SMS)
4. Set communication status to SENDING
5. Insert `communication_recipients` rows with PENDING status
6. Process in batches of 50:
   - Email: call `sendEmail()` with `BulkCommunicationEmail` template, store Resend message ID
   - SMS: call `sendSMS()`, store Telnyx message ID
   - Update each recipient row to SENT with externalId
   - On per-recipient failure: set status to FAILED with error, continue batch
7. After all batches: update communication status (SENT if all succeeded, PARTIAL_FAILURE if some failed, FAILED if all failed)
8. Set recipientCount and sentAt

### SMS Integration

**`src/lib/sms/`:**

- `client.ts` — Telnyx client singleton, lazy-loaded from `TELNYX_API_KEY` env var
- `send.ts` — `sendSMS({ to, body, from })` helper, returns `{ messageId, status }`
- Phone numbers stored in international format on `members.phone`

### Webhook Endpoints

**`src/app/api/webhooks/resend/route.ts`:**
- POST handler, verifies Resend webhook signature via `svix` headers
- Events: `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complaint`
- Looks up `communication_recipients` by `externalId`, updates status + timestamp

**`src/app/api/webhooks/telnyx/route.ts`:**
- POST handler, verifies Telnyx webhook signature
- Events: `message.sent`, `message.delivered`, `message.failed`
- Looks up by `externalId`, updates status

### Automated SMS Triggers

Extend existing cron routes:

**`/api/cron/bookings`** — add after existing payment reminder logic:
- If org has `smsPreArrivalEnabled`:
  - Find bookings with `checkInDate` within `smsPreArrivalHours`
  - Skip if SMS already sent for this booking (check `communication_recipients`)
  - Create a communication record (type: automated pre-arrival)
  - Send SMS: "Hi {firstName}, reminder: your stay at {lodgeName} starts {checkInDate}. See you soon! — {orgName}"

**`/api/cron/subscriptions`** — add after existing email reminder:
- If org has `smsPaymentReminderEnabled`:
  - Send SMS alongside the email reminder for overdue subscriptions
  - "Hi {firstName}, your {orgName} subscription of {amount} is overdue. Please pay at {link}. — {orgName}"

### Email Rendering

New React Email template: `src/lib/email/templates/bulk-communication.tsx`
- Wraps in existing `EmailLayout` (org logo, header, footer)
- Renders markdown body to HTML using `marked` library (compile markdown → HTML string, inject into Email template)
- Supports: headings, bold, italic, links, lists, paragraphs

### New Dependencies

| Package | Purpose |
|---|---|
| `telnyx` | SMS provider SDK |
| `marked` | Markdown → HTML for email rendering |

---

## Access Rules

| Role | Access |
|---|---|
| ADMIN | Full access — compose, send, templates, settings, all communications |
| COMMITTEE | Compose, send, templates, view all communications. No SMS settings. |
| BOOKING_OFFICER | No access to communications page |
| MEMBER | No access |

---

## Testing

### Unit/Integration (~15-20 test files, ~50-70 tests)

**Actions:**
- `create-draft.test.ts` — create, update, validation errors
- `send.test.ts` — recipient resolution, batch processing, partial failure handling, status transitions
- `templates.test.ts` — CRUD operations, org isolation
- `recipients.test.ts` — filter combinations, exclusion of members without contact info
- `retry-failed.test.ts` — only retries FAILED recipients
- `settings.test.ts` — update org SMS settings, validation
- `list.test.ts` — pagination, status filtering
- `get.test.ts` — aggregated stats computation

**Infrastructure:**
- `sms/send.test.ts` — Telnyx client calls, error handling
- `webhooks/resend.test.ts` — signature verification, status updates, unknown externalId handling
- `webhooks/telnyx.test.ts` — signature verification, status updates
- `bulk-communication-email.test.ts` — markdown rendering, template output

**Cron extensions:**
- `cron/bookings.test.ts` — extend existing tests for pre-arrival SMS trigger
- `cron/subscriptions.test.ts` — extend existing tests for payment reminder SMS

### E2E (`e2e/admin-communications.spec.ts`, ~8-10 tests)

- Communications page loads with three tabs
- Compose email: set subject, write markdown body, filter recipients by class, preview, send
- Draft save and resume editing
- Template create from compose, load template into new message
- Message detail page shows delivery stats and recipient table
- SMS compose shows character counter
- Channel "Both" shows dual editors
- Role access: booking officer cannot see communications nav item

---

## Responsive Behaviour

- Compose page: side-by-side markdown/preview on desktop, tabbed on mobile
- Recipient filters: horizontal row on desktop, stacked on mobile
- Tables: horizontal scroll on mobile with card view alternative
- Action bar: sticky bottom on all viewports
- Settings: single column, full width inputs
