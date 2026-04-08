# Phase 16: Waitlist — Entry, Notification, Conversion to Booking

## Overview

When a member tries to book dates that are fully booked, they can join a waitlist. An admin monitors the waitlist and manually notifies members when a spot opens up (e.g. due to cancellation). The notified member then completes a normal booking themselves within a time window.

## Data Model

### Schema Change

Add `expiresAt` column to the existing `waitlistEntries` table:

```typescript
expiresAt: timestamp("expires_at", { withTimezone: true }),
```

Existing schema (`src/db/schema/waitlist.ts`) already provides:
- `id` (UUID)
- `bookingRoundId` (FK)
- `lodgeId` (FK)
- `memberId` (FK)
- `checkInDate` (date)
- `checkOutDate` (date)
- `numberOfGuests` (integer)
- `status` (WAITING | NOTIFIED | CONVERTED | EXPIRED)
- `notifiedAt` (timestamp)
- `createdAt` (timestamp)

### Status Lifecycle

```
WAITING → NOTIFIED → CONVERTED
                  → EXPIRED
```

- **WAITING** — member is on the waitlist
- **NOTIFIED** — admin clicked "Notify", email sent, expiry clock starts
- **CONVERTED** — member completed a booking for those dates
- **EXPIRED** — member did not book within the expiry window (48 hours default)

### Conversion Detection

When a booking is created (`src/actions/bookings/create.ts`), after successful insertion, check for any NOTIFIED waitlist entries matching that member + lodge + overlapping dates. If found, update status to CONVERTED. No explicit foreign key link between waitlist entry and booking.

## Waitlist Entry Point

### Member Join Flow

Dedicated page at `/[slug]/waitlist` with a form collecting:
- Lodge (dropdown)
- Check-in / check-out dates
- Number of guests

### Validation Rules

1. Member must be authenticated and financial
2. Dates must be within an active season
3. Lodge must exist for the organisation
4. No duplicate waitlist entry (same member + lodge + overlapping dates with WAITING status)
5. Dates must actually be fully booked (otherwise show validation error with link to normal booking)

### UX Integration

The availability calendar shows a "Join Waitlist" link on fully-booked dates. No changes to the existing booking wizard.

## Admin Waitlist Management

### Admin Page

New page at `/[slug]/admin/waitlist`.

**List view:**
- Table columns: member name, lodge, dates, guests, status, created date, notified date
- Filters: by lodge, by status, by date range
- Sort: creation date ascending (first come, first served)
- Each row shows current availability for the relevant lodge/dates

**Actions per entry:**
- **Notify** (WAITING only) — sends "spot available" email, sets `notifiedAt` and `expiresAt` (48 hours), transitions to NOTIFIED
- **Remove** — admin removes an entry from the waitlist

No bulk actions. Admin handles entries individually.

## Notifications

### Email Templates

**Waitlist Confirmation** (`waitlist-confirmation.tsx`)
- Sent when member joins the waitlist
- Content: "You've been added to the waitlist for [Lodge] on [check-in] to [check-out]"

**Spot Available** (`waitlist-spot-available.tsx`)
- Sent when admin clicks "Notify"
- Content: lodge name, dates, guest count, link to booking wizard, 48-hour expiry notice

No SMS notifications for waitlist. Email only.

### Expiry Handling

A daily cron job checks for NOTIFIED entries past their `expiresAt` and transitions them to EXPIRED. No expiry email sent. Admin can see expired entries and decide whether to notify the next person on the list.

## File Structure

```
src/
  actions/waitlist/
    join.ts              — join waitlist server action
    queries.ts           — list/get waitlist entries (admin + member)
    notify.ts            — admin notify action
    remove.ts            — admin remove entry
    expire.ts            — cron: expire stale NOTIFIED entries
    __tests__/
      join.test.ts
      queries.test.ts
      notify.test.ts
      remove.test.ts
      expire.test.ts
  app/[slug]/
    waitlist/
      page.tsx           — member-facing join form
    admin/waitlist/
      page.tsx           — admin waitlist management
  lib/email/templates/
    waitlist-confirmation.tsx
    waitlist-spot-available.tsx
```

## Test Coverage

- **Join:** auth, financial status, dates in season, lodge exists, fully booked check, no duplicates, successful creation, confirmation email sent
- **Queries:** filter by lodge/status/date range, pagination, org scoping
- **Notify:** auth/role check (COMMITTEE+), status transition WAITING→NOTIFIED, email sent, expiresAt set, reject if not WAITING
- **Remove:** auth/role check, entry deleted/removed
- **Expire:** finds NOTIFIED entries past expiresAt, transitions to EXPIRED, ignores other statuses
- **Conversion detection:** booking creation matches NOTIFIED entry → CONVERTED, no match → no change
- **Email templates:** both templates render correctly with all props

## Out of Scope

- SMS notifications for waitlist
- Automatic detection/notification when spots open (admin-driven only)
- Temporary bed holds for notified members
- Waitlist integrated into booking wizard
- Bulk notify actions
- Waitlist position display to members
