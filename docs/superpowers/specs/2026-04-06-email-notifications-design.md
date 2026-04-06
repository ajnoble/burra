# Phase 8: Email Notifications — Design Spec

## Overview

Add transactional email notifications to Snow Gum using Resend + React Email. 12 templates covering booking lifecycle, payments, membership, and general notifications. Minimal, text-focused design. Fire-and-forget delivery.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Email provider | Resend | Already in .env.example, React Email integration |
| Template count | 12 | Covers all transactional events + general notification |
| Sender identity | Platform sender with org reply-to | `noreply@snowgum.site`, reply-to org `contactEmail` |
| Sender display name | `"{orgName} via Snow Gum"` | Clear attribution to both platform and club |
| Booking reminder timing | Configurable per-org | `bookingReminderHours` column, default 48 |
| Delivery model | Fire-and-forget | No await, catch errors to console.error |
| Architecture | Monolithic email module | All templates in `src/lib/email/templates/` |
| Visual style | Minimal / text-focused | White background, org logo, system fonts, clean typography |
| Admin notifications | Copy on bookings only | Booking created/cancelled sends to org `contactEmail` |

## Packages

- `resend` — email API client
- `@react-email/components` — React Email component library

## Module Structure

```
src/lib/email/
  client.ts              — Resend client singleton
  send.ts                — sendEmail() fire-and-forget helper
  templates/
    layout.tsx           — shared base layout (logo, footer, typography)
    welcome.tsx
    booking-confirmation.tsx
    booking-cancelled.tsx
    booking-approved.tsx
    booking-modified.tsx
    booking-reminder.tsx
    payment-received.tsx
    payment-expired.tsx
    membership-renewal-due.tsx
    financial-status-changed.tsx
    admin-booking-notification.tsx
    general-notification.tsx
```

## sendEmail() Interface

```ts
sendEmail(options: {
  to: string | string[]
  subject: string
  template: React.ReactElement
  replyTo?: string
  orgName?: string
})
```

- Sender: `noreply@snowgum.site` with display name `"${orgName} via Snow Gum"` (falls back to `"Snow Gum"`)
- Reply-to: org `contactEmail` when available
- Fire-and-forget: calls `resend.emails.send()` without awaiting in the calling code; internally catches errors and logs them
- No retry logic — Resend handles retries on their side

## Schema Change

Add to `organisations` table:

```ts
bookingReminderHours: integer("booking_reminder_hours").notNull().default(48)
```

## Template Details

### 1. Welcome

- **Trigger**: Member created (admin action or CSV import)
- **Recipient**: New member email
- **Subject**: `"Welcome to {orgName}"`
- **Content**: Org name, login link (`{appUrl}/{slug}/login`), member number (if set)

### 2. Booking Confirmation

- **Trigger**: Booking created (`src/actions/bookings/create.ts`)
- **Recipient**: Primary member
- **Subject**: `"Booking confirmed — {bookingReference}"`
- **Content**: Reference, lodge name, check-in/check-out dates, guest list, total amount, Pay Now link

### 3. Booking Cancelled

- **Trigger**: Booking cancelled (wired in Phase 9)
- **Recipient**: Primary member
- **Subject**: `"Booking cancelled — {bookingReference}"`
- **Content**: Reference, lodge name, dates, refund amount (if any), reason

### 4. Booking Approved

- **Trigger**: Admin approves booking (wired in Phase 9)
- **Recipient**: Primary member
- **Subject**: `"Booking approved — {bookingReference}"`
- **Content**: Reference, lodge name, dates, Pay Now link

### 5. Booking Modified

- **Trigger**: Admin modifies booking (wired in Phase 9)
- **Recipient**: Primary member
- **Subject**: `"Booking updated — {bookingReference}"`
- **Content**: Reference, summary of changes, new total

### 6. Booking Reminder

- **Trigger**: Cron/scheduled job (trigger mechanism built later)
- **Recipient**: Primary member
- **Subject**: `"Reminder: your stay at {lodgeName} is coming up"`
- **Content**: Reference, lodge name, check-in/check-out dates, guest list

### 7. Payment Received

- **Trigger**: Stripe webhook `checkout.session.completed`
- **Recipient**: Primary member
- **Subject**: `"Payment received — {bookingReference}"`
- **Content**: Reference, amount paid, payment date

### 8. Payment Expired

- **Trigger**: Stripe webhook `checkout.session.expired`
- **Recipient**: Primary member
- **Subject**: `"Payment session expired — {bookingReference}"`
- **Content**: Reference, amount due, new Pay Now link

### 9. Membership Renewal Due

- **Trigger**: Cron/scheduled job (wired in Phase 10)
- **Recipient**: Member
- **Subject**: `"Membership renewal due — {orgName}"`
- **Content**: Season name, amount due, due date, pay link

### 10. Financial Status Changed

- **Trigger**: Admin changes `isFinancial` (`src/actions/members/update.ts`)
- **Recipient**: Member
- **Subject**: `"Membership status updated — {orgName}"`
- **Content**: New status (financial/unfinancial), reason provided by admin

### 11. Admin Booking Notification

- **Trigger**: Booking created or cancelled
- **Recipient**: Org `contactEmail`
- **Subject**: `"[Admin] Booking {action} — {bookingReference}"`
- **Content**: Reference, member name, lodge, dates, action (created/cancelled), link to admin dashboard

### 12. General Notification

- **Trigger**: Admin sends manually (UI built in Phase 13)
- **Recipient**: Any member(s)
- **Subject**: Custom (provided by admin)
- **Content**: Custom body text, rendered as formatted text within the standard layout

## Integration Points

### Immediate (Phase 8)

| Trigger file | Email(s) sent |
|-------------|---------------|
| `src/actions/members/create.ts` | Welcome |
| `src/actions/bookings/create.ts` | Booking Confirmation + Admin Booking Notification |
| `src/actions/stripe/webhook-handlers.ts` (completed) | Payment Received |
| `src/actions/stripe/webhook-handlers.ts` (expired) | Payment Expired |
| `src/actions/members/update.ts` (isFinancial change) | Financial Status Changed |

### Deferred (template built, wired later)

| Template | Wired in |
|----------|----------|
| Booking Approved | Phase 9 |
| Booking Modified | Phase 9 |
| Booking Cancelled | Phase 9 |
| Booking Reminder | When cron mechanism added |
| Membership Renewal Due | Phase 10 |
| General Notification | Phase 13 |

## Base Layout

Shared React Email layout component used by all 12 templates:

- **Header**: Org logo (from `logoUrl`, omitted if not set), org name
- **Body**: Content slot — each template renders its own content here
- **Footer**: Org name, "Powered by Snow Gum" (no unsubscribe mechanism — these are transactional emails, not marketing)
- **Style**: White background, `#111` text, system font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`), 600px max-width, 24px padding

## Testing Strategy

### Template rendering tests

- Each template renders with sample props and produces HTML containing expected content
- Base layout renders logo when `logoUrl` provided, omits when not
- Base layout renders org name and footer

### sendEmail() tests

- Mock Resend client
- Verify `from`, `to`, `replyTo`, `subject` passed correctly
- Verify sender display name format
- Verify errors caught and logged, not thrown

### Integration tests (trigger points)

- Mock `sendEmail` at module level
- `actions/members/create.ts`: calls sendEmail with Welcome template after member insert
- `actions/bookings/create.ts`: calls sendEmail twice (Booking Confirmation + Admin Booking Notification)
- `actions/stripe/webhook-handlers.ts`: calls sendEmail with Payment Received on completed, Payment Expired on expired
- `actions/members/update.ts`: calls sendEmail with Financial Status Changed only when `isFinancial` actually changes

### Out of scope for Phase 8 testing

- Actual Resend API calls (manual verification with test key)
- Cron-triggered template delivery
- E2E email delivery tests
