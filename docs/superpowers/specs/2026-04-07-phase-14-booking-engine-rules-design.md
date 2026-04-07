# Phase 14: Booking Engine Rules — Design Spec

## Overview

Auto-cancel unpaid bookings after a configurable deadline + grace period, with email reminders leading up to the deadline. Configuration lives at org level (defaults) with per-round overrides and per-booking admin overrides.

Minimum nights validation already exists via `tariffs.minimumNights` — no work needed.

## Schema Changes

### Organisation Table

Two new columns for org-level defaults:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `bookingPaymentGraceDays` | integer NOT NULL | 7 | Days after `balanceDueDate` before auto-cancel |
| `bookingPaymentReminderDays` | jsonb (int[]) NOT NULL | [7, 1] | Days before `balanceDueDate` to send reminders |

### Booking Rounds Table

Three new columns (nullable = fall back to org default):

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `balanceDueDate` | date | null | Fixed payment deadline for all bookings in this round |
| `paymentGraceDays` | integer | null | Override org grace period |
| `paymentReminderDays` | jsonb (int[]) | null | Override org reminder schedule |
| `autoCancelRefundPolicy` | text | null | `"none"`, `"cancellation_policy"`, or `"full"` — null defaults to `"cancellation_policy"` |

### Bookings Table

One new column (existing `balanceDueDate` already present):

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `paymentRemindersSentAt` | jsonb (Record<number, string>) | null | Tracks which reminder days have been sent, e.g. `{"7": "2027-05-01T...", "1": "2027-05-06T..."}` |

## Booking Creation Changes

When a booking reaches `CONFIRMED` status (either directly on creation or via admin approval from `PENDING`):

1. Look up the booking round's `balanceDueDate`
2. If set, copy it to `bookings.balanceDueDate`
3. If null, leave `bookings.balanceDueDate` null (no payment deadline, no auto-cancel)

The due date is set server-side from round config. No changes to the member-facing booking wizard UI.

Admins can override `balanceDueDate` per booking from the booking detail page.

## Cron Job: Payment Reminders & Auto-Cancel

**Route:** `GET /api/cron/bookings/route.ts`
**Action:** `src/actions/bookings/cron.ts`
**Auth:** `Authorization: Bearer ${CRON_SECRET}` (same as existing crons)

Three sequential passes:

### Pass 1: Payment Reminders

Query bookings where:
- `status = CONFIRMED`
- `balancePaidAt IS NULL`
- `balanceDueDate IS NOT NULL`

For each booking, resolve reminder schedule (round `paymentReminderDays` ?? org `bookingPaymentReminderDays`). For each reminder day threshold:
- If `daysUntilDueDate <= reminderDay` AND that day not in `paymentRemindersSentAt`
- Send `BookingPaymentReminderEmail`
- Record in `paymentRemindersSentAt`

### Pass 2: Auto-Cancel Unpaid

Query bookings where:
- `status = CONFIRMED`
- `balancePaidAt IS NULL`
- `balanceDueDate IS NOT NULL`
- `today >= balanceDueDate + gracePeriodDays` (round `paymentGraceDays` ?? org `bookingPaymentGraceDays`)

For each booking:
1. Determine refund policy (round `autoCancelRefundPolicy` ?? `"cancellation_policy"`)
   - `"none"` — refund 0
   - `"cancellation_policy"` — use existing `calculateRefundAmount()` from `src/lib/refund.ts`
   - `"full"` — refund full amount paid
2. Call existing `cancelBooking()` with reason `"Auto-cancelled: payment deadline expired"`
   - Handles: status update, availability release, Stripe refund, transaction record
3. Send `BookingAutoCancelledEmail` to member
4. Send `AdminBookingNotificationEmail` with action `"auto-cancelled"`

### Pass 3: Expired Hold Cleanup

```sql
DELETE FROM bed_holds WHERE expires_at < now()
```

Lightweight sweep for orphaned holds between user sessions.

## Admin UI Changes

### Org Settings Page

Add a "Booking Payment Rules" card:
- **Payment Grace Period (days)** — integer input, default 7
- **Payment Reminder Schedule** — comma-separated days input (e.g., "7, 1"), helper text: "Days before due date to send payment reminders"

### Booking Round Form

Add optional fields (blank = org defaults):
- **Balance Due Date** — date picker
- **Payment Grace Period** — integer input, placeholder "Use org default (X days)"
- **Auto-Cancel Refund Policy** — select: "Use cancellation policy" / "No refund" / "Full refund"

Reminder days override exists in the schema but is omitted from the round form UI for simplicity.

### Booking Detail Page

- Display `balanceDueDate` with days remaining or "Overdue" badge
- Inline edit for admin to override `balanceDueDate` per booking
- Show payment reminder history from `paymentRemindersSentAt`

## Email Templates

### BookingPaymentReminderEmail

- **Trigger:** Cron reminder pass
- **Props:** orgName, bookingRef, lodge, dates, totalAmountCents, balanceDueDate, daysRemaining, payUrl, logo
- **Content:** Payment reminder with amount, due date, days remaining, and Pay Now button

### BookingAutoCancelledEmail

- **Trigger:** Cron auto-cancel pass
- **Props:** orgName, bookingRef, lodge, dates, totalAmountCents, refundAmountCents, reason, logo
- **Content:** Cancellation notice explaining missed deadline, refund details if applicable, org contact info

Admin receives existing `AdminBookingNotificationEmail` with action `"auto-cancelled"` for both reminder and cancel events.

## Testing Strategy

### Unit Tests (Vitest)

**Cron action** (`actions/bookings/cron.test.ts`):
- Sends reminders at correct day thresholds
- Does not re-send already-sent reminders
- Skips bookings without `balanceDueDate`
- Skips already-paid bookings
- Auto-cancels after grace period expires
- Resolves config: round override > org default
- Applies correct refund policy per round setting
- Cleans up expired bed holds

**Booking creation** (`actions/bookings/create.test.ts`):
- Sets `balanceDueDate` from round config on CONFIRMED bookings
- Leaves `balanceDueDate` null when round has none

**Booking approval** (`actions/bookings/approve.test.ts`):
- Sets `balanceDueDate` on PENDING → CONFIRMED transition

### Integration Tests
- Admin configures payment grace days and reminder schedule in org settings
- Admin sets balance due date on a booking round
- Admin overrides `balanceDueDate` on individual booking
- Cron endpoint returns 401 without valid secret

No Playwright E2E for cron — tested via unit/integration against the action directly.

## Config Resolution

All config follows the same resolution pattern:

```
booking-level override > round-level override > org-level default
```

- `balanceDueDate`: booking field > round field (no org default — intentionally opt-in per round)
- `gracePeriodDays`: round `paymentGraceDays` > org `bookingPaymentGraceDays`
- `reminderDays`: round `paymentReminderDays` > org `bookingPaymentReminderDays`
- `refundPolicy`: round `autoCancelRefundPolicy` > `"cancellation_policy"` (hardcoded fallback)

## Out of Scope

- Deposit/partial payment flow (fields exist but not activated)
- WAITLISTED status and waitlist conversion
- Real-time cancellation triggers (Stripe webhook-driven)
- Minimum nights changes (already implemented)
