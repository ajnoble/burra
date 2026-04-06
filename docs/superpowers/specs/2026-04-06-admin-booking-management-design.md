# Phase 9: Admin Booking Management

## Overview

Admin-facing booking management for Snow Gum: list, approve, cancel, modify dates, reassign beds, and configurable cancellation policies. Also adds member self-cancel from the dashboard.

## Decisions

- **Payment gated on approval** — PENDING bookings block payment until admin approves. Approval email includes payment link.
- **Both admin and member can cancel** — admin gets refund override ability, members use policy-calculated amount only.
- **Cancellation uses tiered time-based policy with admin override** — policy calculates default refund based on days before check-in; admin can adjust per-booking.
- **Modify = dates and beds only** — guest list changes require cancel-and-rebook. Keeps modification logic tractable.
- **Bed reassignment is inline dropdowns** — visual lodge map deferred to a future phase.
- **Single admin bookings page** — list + detail view, follows existing admin patterns (members, lodges).
- **Default approval note** — configurable at org level, pre-filled in approve dialog, editable per-booking.

## Schema Changes

### organisations table

Add one column:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultApprovalNote` | text | null | Pre-filled in the approve dialog. E.g., "Welcome! Please complete payment within 7 days." |

### Existing columns already in place

These columns on `bookings` are already in the schema and will be populated by Phase 9 actions:

- `approvedAt` (timestamp) — set on approval
- `approvedByMemberId` (uuid) — who approved
- `cancellationReason` (text) — set on cancel
- `cancelledAt` (timestamp) — set on cancel
- `refundAmountCents` (int) — set on cancel if paid
- `adminNotes` (text) — editable from detail view
- `cancellationPolicyId` (uuid) — linked at booking creation time (existing bookings: look up org default)

### cancellationPolicies table (existing)

Already exists with the right structure. `rules` JSONB stores an array of:

```typescript
{ daysBeforeCheckin: number; forfeitPercentage: number }
```

Rules are sorted by `daysBeforeCheckin` descending. First match where `daysUntilCheckin >= rule.daysBeforeCheckin` wins. If no rule matches, 100% forfeit (no refund).

Example:
```json
[
  { "daysBeforeCheckin": 14, "forfeitPercentage": 0 },
  { "daysBeforeCheckin": 7, "forfeitPercentage": 25 },
  { "daysBeforeCheckin": 3, "forfeitPercentage": 50 }
]
```

Translates to: 14+ days = full refund, 7-13 = 75%, 3-6 = 50%, <3 = no refund.

## Pages

### 1. Admin Booking List — `/[slug]/admin/bookings`

**Layout:** Filterable table with quick filter tabs.

**Filters:**
- Search: booking reference or member name (debounced, server-side)
- Status dropdown: All / Pending / Confirmed / Cancelled / Completed
- Lodge dropdown: All / per lodge
- Date range: check-in date range picker

**Quick filter tabs:**
- All (count)
- Pending Approval (count) — highlighted when > 0
- Upcoming (confirmed, checkIn >= today)
- Unpaid (confirmed, balancePaidAt is null)

**Table columns:** Reference, Member, Dates, Lodge, Guests (count), Amount, Status

**Pagination:** 20 per page, server-side.

**Row click:** Navigates to booking detail page.

### 2. Admin Booking Detail — `/[slug]/admin/bookings/[id]`

**Layout:** Two-column page.

**Left column:**
- Primary member info (name, email, member number, membership class)
- Stay details (check-in, check-out, nights, lodge)
- Financials (subtotal, discount, total, payment status with date)
- Admin notes (editable textarea, auto-saves or save button)

**Right column:**
- Guest list with bed assignments (room name, bed label per guest, price per guest)
- "Reassign Beds" button → switches to inline edit mode with dropdowns
- "Modify Dates" section — date inputs + "Update Dates" button

**Header:**
- Booking reference + status badge
- Context-sensitive action buttons:
  - PENDING: Approve + Cancel
  - CONFIRMED: Cancel
  - CANCELLED: no actions (read-only view)

### 3. Cancellation Policy Config — `/[slug]/admin/settings` (new section)

**Layout:** Added as a section within the existing settings page (or a new tab if settings uses tabs).

**Features:**
- Policy name (text input)
- Tiered rules: add/remove rows, each with `daysBeforeCheckin` (int) and `forfeitPercentage` (int 0-100)
- Fallback display: "Otherwise → 100% forfeit (no refund)"
- Live preview table: human-readable summary of all tiers
- "Set as default" checkbox
- Save button

### 4. Member Self-Cancel — existing dashboard booking detail

**Addition:** "Cancel Booking" button on the member's booking detail view.

Shows:
- Policy-calculated refund amount (no override)
- Cancellation reason textarea
- Confirmation dialog with "this will release your beds" warning

## Server Actions

### `approveBooking(bookingId, organisationId, approverMemberId, note?)`

1. Verify booking exists, status = PENDING, belongs to org
2. Update booking: status → CONFIRMED, approvedAt → now(), approvedByMemberId → approver
3. Send `booking-approved` email to primary member (include note if provided, include pay URL)
4. Send `admin-booking-notification` email (action: "approved")
5. Return `{ success: true }`

### `cancelBooking(input)`

Input: `{ bookingId, organisationId, cancelledByMemberId, reason, refundOverrideCents? }`

1. Verify booking exists, status IN (PENDING, CONFIRMED), belongs to org
2. Calculate refund:
   - If booking not paid (balancePaidAt is null): refundAmountCents = 0
   - If paid: look up cancellationPolicy, calculate days until checkIn, find matching tier, compute refund = totalAmountCents * (100 - forfeitPercentage) / 100
   - If `refundOverrideCents` provided (admin only): use that instead
3. Begin transaction:
   - Update booking: status → CANCELLED, cancelledAt → now(), cancellationReason → reason, refundAmountCents → calculated/overridden amount
   - Decrement `availabilityCache.bookedBeds` for each night in the booking's date range
   - If refundAmountCents > 0 and booking was paid:
     - Create REFUND transaction (amountCents = -refundAmountCents)
     - Call Stripe refund API (refund the payment intent, amount = refundAmountCents)
4. Send `booking-cancelled` email to primary member (include reason, refund amount if > 0)
5. Send `admin-booking-notification` email (action: "cancelled")
6. Return `{ success: true, refundAmountCents }`

**Member self-cancel:** Same action, but `refundOverrideCents` is not accepted (always uses policy calculation). Auth check ensures the cancelling member is the booking's primaryMemberId.

### `modifyBookingDates(input)`

Input: `{ bookingId, organisationId, newCheckInDate, newCheckOutDate }`

1. Verify booking exists, status IN (PENDING, CONFIRMED), belongs to org
2. Validate new dates:
   - Run booking date validation (season, availability, min/max nights) against new dates
   - Exclude current booking's beds from availability check (they're being moved, not double-booked)
3. Begin transaction:
   - Release old dates: decrement availabilityCache.bookedBeds for old date range
   - Book new dates: increment availabilityCache.bookedBeds for new date range (with SELECT FOR UPDATE)
   - Recalculate pricing for each guest using new date range (weekday/weekend split may change)
   - Update booking: checkInDate, checkOutDate, totalNights, subtotalCents, discountAmountCents, totalAmountCents
   - Update bookingGuests: pricePerNightCents, totalAmountCents per guest
   - If booking had an INVOICE transaction, update its amountCents to new total
   - If booking was already paid and new total differs:
     - New total > paid: booking shows as "underpaid" — member needs to pay the difference (handled via existing checkout flow on next payment)
     - New total < paid: booking shows as "overpaid" — admin can issue a partial refund separately via cancel flow, or note it in admin notes. No automatic refund on modify.
4. Build changes description string (e.g., "Dates changed from 12-16 Jul to 14-18 Jul. New total: $920.00")
5. Send `booking-modified` email to primary member
6. Send `admin-booking-notification` email (action: "modified")
7. Return `{ success: true, newTotalAmountCents }`

### `reassignBeds(input)`

Input: `{ bookingId, organisationId, assignments: [{ bookingGuestId, bedId }] }`

1. Verify booking exists, belongs to org
2. For each assignment, verify the bed belongs to the booking's lodge
3. For each assignment, verify the bed is available for the booking's date range (not booked by another booking's guest)
4. Update bookingGuests: set bedId and roomId (derived from bed's parent room) for each guest
5. Return `{ success: true }`

No email sent — bed reassignment is an internal admin action.

### `updateAdminNotes(bookingId, organisationId, notes)`

Simple update of booking.adminNotes. No email.

### `calculateRefund(bookingId, organisationId)`

Pure query (no mutation). Returns `{ policyName, daysUntilCheckin, forfeitPercentage, refundAmountCents, totalPaidCents }` for display in the cancel dialog before confirming.

### `saveCancellationPolicy(input)`

Input: `{ organisationId, id?, name, rules: [{ daysBeforeCheckin, forfeitPercentage }], isDefault }`

1. Validate rules: daysBeforeCheckin must be > 0, forfeitPercentage must be 0-100, no duplicate daysBeforeCheckin values
2. Sort rules by daysBeforeCheckin descending
3. Upsert cancellationPolicy record
4. If isDefault: clear isDefault on other policies for this org, set on this one
5. Return `{ success: true, id }`

### `updateDefaultApprovalNote(organisationId, note)`

Update organisations.defaultApprovalNote. Part of existing org settings update flow.

## Queries

### `getAdminBookings(input)`

Input: `{ organisationId, status?, lodgeId?, search?, dateFrom?, dateTo?, page, pageSize }`

- Joins bookings → members (for name), bookings → lodges (for name)
- Counts booking_guests per booking for guest count
- Filters by organisationId always
- Optional filters: status, lodgeId, checkInDate range, search (ILIKE on bookingReference or member firstName/lastName)
- Orders by createdAt desc
- Returns `{ bookings: BookingListItem[], totalCount, page, pageSize }`

### `getAdminBookingDetail(bookingId, organisationId)`

- Full booking record with all columns
- Joins: lodge (name), primaryMember (name, email, memberNumber, membershipClass)
- All bookingGuests with: member name, bed label, room name, pricing
- Related transactions (INVOICE, PAYMENT, REFUND)
- Approval info (approvedAt, approver name)
- Returns typed `AdminBookingDetail` object

### `getPendingApprovalCount(organisationId)`

Simple count query: `WHERE status = 'PENDING' AND organisationId = ?`

Used for sidebar badge and quick filter tab count.

### `getAvailableBeds(lodgeId, checkInDate, checkOutDate, excludeBookingId?)`

Returns beds in the lodge that are not booked by any other booking for the given date range. `excludeBookingId` ensures the current booking's beds show as available (for reassignment within the same booking).

Groups beds by room for the dropdown UI: `[{ roomId, roomName, beds: [{ bedId, label, type }] }]`

### `getCancellationPolicies(organisationId)`

Returns all policies for the org. Used in settings page and when linking policy to booking.

## Stripe Refund Integration

### `processStripeRefund(bookingId, refundAmountCents)`

1. Look up the PAYMENT transaction for this booking (has stripePaymentIntentId)
2. If no payment found, skip (booking was unpaid)
3. Call `stripe.refunds.create({ payment_intent: paymentIntentId, amount: refundAmountCents })` on the connected account
4. Store Stripe refund ID on the REFUND transaction record
5. Return `{ success: true, stripeRefundId }`

Uses the connected account's Stripe credentials (same pattern as checkout). Partial refunds are supported by Stripe — the `amount` param handles this.

## Email Integration

| Event | Template | Recipient | Status |
|-------|----------|-----------|--------|
| Approve booking | `booking-approved` | Primary member | Template exists, wire up |
| Cancel booking | `booking-cancelled` | Primary member | Template exists, wire up |
| Modify dates | `booking-modified` | Primary member | Template exists, wire up |
| Any admin action | `admin-booking-notification` | Org contactEmail | Template exists, wire up |

All emails sent fire-and-forget (existing pattern). The `booking-approved` email includes the approval note (if provided) and a payment URL.

## Access Control

- Admin booking pages: require role >= BOOKING_OFFICER (existing middleware pattern)
- `approveBooking`, `modifyBookingDates`, `reassignBeds`, `updateAdminNotes`: require role >= BOOKING_OFFICER
- `cancelBooking` (admin path): require role >= BOOKING_OFFICER
- `cancelBooking` (member path): require authenticated member who is the booking's primaryMemberId
- `saveCancellationPolicy`, `updateDefaultApprovalNote`: require role >= ADMIN
- Cancellation policy config UI: visible to ADMIN role only

## Out of Scope

- Visual lodge map for bulk bed reallocation (future phase)
- Add/remove guests from existing booking (cancel and rebook)
- Change lodge on existing booking (cancel and rebook)
- Booking reminder cron job (Phase 8 deferred)
- Waitlist integration on cancellation (Phase 14)
- Audit log entries for admin actions (Phase 16)
