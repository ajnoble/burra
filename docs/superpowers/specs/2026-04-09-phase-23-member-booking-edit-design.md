# Phase 23 — Member Self-Service Booking Editing

## Context

Members currently cannot modify their own bookings — they can only cancel. Admins can modify dates via `modifyBookingDates`, but there is no member-facing edit flow. Both competitors (CBDweb, Clubman) offer self-service editing. This phase adds configurable member self-editing of dates, guests, and beds with proper validation, pricing, payment delta handling, and audit.

## Design Decisions

- **Edit scope:** Dates, guests, and bed assignments — full self-service
- **Approach:** Single unified `memberEditBooking` action handling all changes atomically in one transaction
- **Price delta (paid bookings):** Auto Stripe refund for decreases; top-up invoice via Stripe Checkout for increases
- **Edit window:** Org-level setting only (`memberBookingEditWindowDays`)
- **Re-approval:** Configurable org setting (`memberEditRequiresApproval`) — when true and the booking's round has `requiresApproval`, edits set status back to PENDING
- **UI:** Full page at `/{slug}/dashboard/bookings/{id}` with inline edit form

---

## 1. Data Model Changes

### `organisations` table — two new columns

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `member_booking_edit_window_days` | integer NOT NULL | 0 | 0 = disabled. N = members can edit when N+ days before check-in |
| `member_edit_requires_approval` | boolean NOT NULL | false | When true, edits on bookings from approval-required rounds set status back to PENDING |

### Migration

```sql
ALTER TABLE "organisations" ADD COLUMN "member_booking_edit_window_days" integer NOT NULL DEFAULT 0;
ALTER TABLE "organisations" ADD COLUMN "member_edit_requires_approval" boolean NOT NULL DEFAULT false;
```

No other schema changes. Existing `bookings`, `booking_guests`, `transactions`, `availability_cache`, and `audit_log` tables have all columns needed.

---

## 2. Edit Eligibility Rules

A member can edit a booking when ALL of these are true:

1. **Feature enabled:** `org.memberBookingEditWindowDays > 0`
2. **Ownership:** `booking.primaryMemberId === session.memberId`
3. **Status:** booking is `CONFIRMED` or `PENDING` (not CANCELLED, COMPLETED, or WAITLISTED)
4. **Edit window:** `daysUntilCheckin >= org.memberBookingEditWindowDays`
5. **Not checked in:** check-in date is in the future

The edit form shows these constraints — e.g. "You can edit this booking until 7 days before check-in (March 15)."

### Validation on the new state

- **Dates:** run `validateBookingDates` with `excludeBookingId` (skips round-open check, excludes this booking from night caps and availability counts)
- **Guests:** all must exist in the org, all must be financial members
- **Beds:** each selected bed must be available for the date range (excluding this booking's current holds)
- **Primary member** cannot be removed from the guest list

### Re-approval

If `org.memberEditRequiresApproval === true` AND the booking's round has `requiresApproval === true`, the edited booking goes back to `PENDING` status. Otherwise edits take effect immediately.

---

## 3. Core Server Action — `memberEditBooking`

**File:** `src/actions/bookings/member-edit.ts`

**Input:**

```ts
type MemberEditInput = {
  bookingId: string;
  organisationId: string;
  slug: string;
  newCheckInDate?: string;
  newCheckOutDate?: string;
  newGuestMemberIds?: string[];
  newBedAssignments?: { guestMemberId: string; bedId: string }[];
}
```

All edit fields optional — only provide what's changing.

**Flow:**

1. Auth + ownership + eligibility checks (Section 2 rules)
2. Load current booking with guests, beds, tariff snapshots, round info
3. Determine what changed (dates, guests, beds — or combination)
4. If dates changing: call `validateBookingDates` with `excludeBookingId`
5. If guests changing: validate members exist, are financial, in org; look up tariffs for new guests
6. If beds changing: check each bed is available for the date range (excluding current booking)
7. Recalculate pricing via `calculateGuestPrice` + `calculateBookingPrice` for the new state
8. Price delta handling (only when `balancePaidAt` is set):
   - **Decrease:** auto partial Stripe refund + REFUND transaction
   - **Increase:** edit is saved immediately (new dates/guests/beds take effect), new INVOICE transaction for delta is created, return `topUpTransactionId` so member can pay via Stripe Checkout from the detail page
   - **No change:** nothing
   - **Unpaid:** update existing INVOICE amount
9. DB transaction:
   - Release old guest count from old night dates in `availability_cache`
   - Book new guest count on new night dates (`SELECT FOR UPDATE`)
   - Update `bookings` row (dates, nights, pricing, status if re-approval needed)
   - Delete removed `booking_guests`, insert new ones (with tariff snapshots), update existing ones' pricing and bed assignments
   - Update/insert transaction records
10. `createAuditLog` — action `BOOKING_MEMBER_EDITED`, diff of old vs new
11. Send `BookingModifiedEmail` to member (reuse existing template)
12. Send `AdminBookingNotificationEmail` with action `"member-edited"`
13. `revalidatePath`

**Returns:** `{ success, newTotalAmountCents, priceDeltaCents, topUpTransactionId?, requiresApproval? }`

---

## 4. Validation Changes

### `validateBookingDates` — add optional `excludeBookingId`

- When set, skip the "booking round is not currently open" check
- Pass through to `getMemberBookedNightsInRound` so the booking being edited doesn't count toward the night cap
- Pass through to availability check so the booking's current beds are subtracted from `bookedBeds`

### `getMemberBookedNightsInRound` — add optional `excludeBookingId`

- Add `AND bookings.id != excludeBookingId` to the query when provided

### New helper: `getAvailabilityExcludingBooking`

- Takes `lodgeId, checkIn, checkOut, excludeBookingId`
- Queries `availability_cache`, subtracts the excluded booking's guest count from `bookedBeds` for overlapping dates
- Used by both date validation and bed availability checks

---

## 5. Member UI

### New page: `/{slug}/dashboard/bookings/{id}`

Server component. Shows:

- Booking summary: reference, lodge, dates, nights, guest list with beds, total price, status badge, payment status
- **Edit** button (when eligibility rules pass) — or explanation of why editing isn't available
- **Cancel** button (reuses existing `CancelBookingDialog`)

### Edit form (on the detail page, toggled by Edit button)

- **Dates section:** two date inputs, pre-filled. Inline availability feedback as dates change.
- **Guests section:** current guests listed. "Add guest" member search (reuse pattern from booking wizard). "Remove" on non-primary guests.
- **Beds section:** per-guest bed picker showing available beds for selected dates (reuse `getAvailableBeds`). Pre-filled with current assignments. New guests can pick or leave unassigned.
- **Price preview:** current total, new total, delta — shown before submission.
- **Save:** calls `memberEditBooking`. On success:
  - `topUpTransactionId` → redirect to Stripe Checkout
  - `requiresApproval` → "Changes saved, pending admin approval"
  - Refund → "A refund of $X will be issued"
  - Otherwise → success toast, refresh

### Dashboard link

Add "View" link on each upcoming booking card in `/{slug}/dashboard/page.tsx` → booking detail page.

---

## 6. Emails & Audit

### Emails — no new templates

- **`BookingModifiedEmail`** (existing): called with `changes` string, e.g. "Dates: 10 Mar–15 Mar → 12 Mar–17 Mar; Guests: added Jane Smith; Beds: Room 3 Bed A → Room 2 Bed C; Price: $850 → $1,020 (+$170 top-up required)"
- **`AdminBookingNotificationEmail`** (existing): action `"member-edited"`, link to admin booking detail

### Audit log

- Action: `BOOKING_MEMBER_EDITED`
- Entity: `BOOKING` / booking ID
- `previousValue`: `{ checkInDate, checkOutDate, guestMemberIds, bedAssignments, totalAmountCents }`
- `newValue`: same shape with new values
- Uses existing `diffChanges()` to store only what changed

Financial audit: REFUND and INVOICE transactions created by price delta handling serve as the financial trail.

---

## 7. Testing

### Unit tests (TDD)

**`src/actions/bookings/__tests__/member-edit.test.ts`** (~18 cases):

- Auth: rejects unauthenticated, rejects non-owner
- Eligibility: rejects editWindowDays=0, rejects too close to check-in, rejects CANCELLED/COMPLETED/WAITLISTED
- Dates: valid change recalculates pricing, validates via `validateBookingDates` with `excludeBookingId`
- Guests: add inserts `booking_guests` with tariff snapshot, remove deletes row, primary cannot be removed, non-financial rejected
- Beds: valid reassignment updates `booking_guests.bedId`, conflict rejected
- Availability: releases old count, books new count in `availability_cache`
- Price delta (paid): decrease calls `processStripeRefund`, increase returns `topUpTransactionId`, no change does nothing
- Price delta (unpaid): updates existing INVOICE
- Re-approval: sets PENDING when `memberEditRequiresApproval` + round `requiresApproval`
- Audit log written with diff
- Emails sent (member + admin)

**`src/actions/availability/__tests__/validation.test.ts`** (add ~4 cases):

- `excludeBookingId` excludes nights from member cap
- `excludeBookingId` bypasses round-open check
- Availability subtracts excluded booking's beds

### E2E tests

**`e2e/member-booking-edit.spec.ts`** (~7 tests):

1. Admin enables edit window in org settings
2. Member views booking detail from dashboard link
3. Member changes dates — price updates, booking saved
4. Member adds a guest and picks a bed — booking saved
5. Member removes a guest — booking saved, price decreased
6. Edit button absent when editWindowDays=0
7. Edit button absent when too close to check-in

---

## 8. Files to Create/Modify

| File | Action |
|------|--------|
| `src/db/schema/organisations.ts` | Add 2 columns |
| `drizzle/0015_member_booking_edit_window.sql` | New migration |
| `src/actions/availability/validation.ts` | Add `excludeBookingId` |
| `src/actions/availability/validation-helpers.ts` | Add `excludeBookingId` + new availability helper |
| `src/actions/bookings/member-edit.ts` | **New** — core action |
| `src/actions/bookings/queries.ts` | Add `getMemberBookingForEdit` query |
| `src/actions/organisations/update.ts` | Accept new org fields |
| `src/app/[slug]/admin/settings/org-settings-form.tsx` | New input fields |
| `src/app/[slug]/dashboard/bookings/[id]/page.tsx` | **New** — detail page |
| `src/app/[slug]/dashboard/bookings/[id]/edit-booking-form.tsx` | **New** — edit form |
| `src/app/[slug]/dashboard/page.tsx` | Add "View" link |
| `src/actions/availability/__tests__/validation.test.ts` | Add test cases |
| `src/actions/bookings/__tests__/member-edit.test.ts` | **New** — full test file |
| `e2e/member-booking-edit.spec.ts` | **New** — E2E spec |

## 9. Reuse Existing Code

- `calculateGuestPrice` / `calculateBookingPrice` from `src/actions/bookings/pricing.ts`
- `processStripeRefund` from `src/actions/stripe/refund.ts`
- `createCheckoutSession` from `src/actions/stripe/checkout.ts`
- `createAuditLog` / `diffChanges` from `src/lib/audit-log.ts`
- `BookingModifiedEmail` from `src/lib/email/templates/booking-modified.tsx`
- `AdminBookingNotificationEmail` from `src/lib/email/templates/admin-booking-notification.tsx`
- `CancelBookingDialog` pattern for UI components
- `getAvailableBeds` from `src/actions/bookings/beds.ts`
- `sendEmail` from `src/lib/email/send.ts`
- Guest search pattern from booking wizard `AddGuests` step
