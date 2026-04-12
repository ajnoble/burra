# Calendar Booking UX Improvements

## Problem

The availability calendar has several UX issues:

1. **Date not carried over:** When selecting a date on the availability matrix and navigating to the `/book` page, the booking calendar starts on the current month instead of the selected date's month.
2. **No back navigation:** The standalone `/book` page has no menu or links to return to the calendar or dashboard.
3. **Date navigator lacks direct jump:** The matrix date navigator only has arrow buttons and a "Today" button — no way to jump to a specific date or month.
4. **Page navigation breaks flow:** Clicking a cell navigates away from the calendar entirely, making it hard to return and continue browsing availability.

## Solution

### 1. Date Navigator Enhancement

**Component:** `src/components/matrix/date-navigator.tsx`

The static date range text becomes a clickable `Button` (ghost variant) that opens a `Popover` containing:

- **Month/year quick-select row** at the top: two `Select` dropdowns (month name + year) to jump to e.g. "August 2026" instantly.
- **Mini calendar** below: uses shadcn's `Calendar` component (react-day-picker). Clicking any day calls `state.jumpToDate(date)` and closes the popover.

Behavior:
- Changing the month/year selects updates the mini calendar view only (doesn't jump the matrix until a day is clicked).
- Season bounds are respected — dates outside the season range are disabled in the picker.
- The popover closes on date selection or outside click.

### 2. Booking Popover on Cell Click

**New component:** `src/app/[slug]/availability/booking-popover.tsx`

Instead of navigating to `/book` on cell click, a `Popover` appears anchored near the clicked cell.

Contents:
- **Date** — the clicked date, formatted nicely
- **Bed** label (from the matrix data)
- **Lodge** name (already available as prop)
- **Booking Round** selector — `Select` dropdown if multiple rounds are open; static display if only one
- **"Start Booking"** button

Behavior:
- Clicking a second cell while the popover is open updates its content (doesn't open a second popover).
- Only available cells trigger the popover — booked/held/closed cells are ignored.
- The popover captures: `{ date, bedId, bedLabel, lodgeId, lodgeName, roundId, roundName }`.

### 3. Booking Wizard in a Sheet Drawer

**New component:** `src/app/[slug]/availability/booking-sheet.tsx`

Uses shadcn `Sheet` that slides in from the right.

- **Desktop:** ~640px wide. Calendar stays visible behind the overlay.
- **Mobile:** full-width (default Sheet behavior).
- Contains a `BookingProvider` wrapping the existing `WizardContent` (same steps 1-5).
- Pre-populates booking context with the date, bed, lodge, and round from the popover.
- Header with title ("New Booking") and X close button.
- Closing the sheet discards the in-progress booking. If the user has progressed past step 1, a confirmation prompt appears before closing.
- On booking success (step 5 complete), the sheet shows the success message. Closing it refreshes the calendar data to reflect the new booking.

The existing `/book` page continues to work independently for direct links and bookmarks.

### 4. Navigation Header on Standalone `/book` Page

**Component:** `src/app/[slug]/book/booking-wizard.tsx`

Add a top navigation bar with:
- **"Back to Calendar"** link — returns to `/{slug}/availability`
- **Dashboard** link — returns to `/{slug}`

This only applies to the standalone `/book` page, not the Sheet version (which has its own close button).

### 5. Fix Date Initialization Bug

**Component:** `src/app/[slug]/book/steps/select-lodge-dates.tsx`

Currently, `year` and `month` state are initialized from `new Date()` (today). When arriving at `/book?checkIn=2026-06-15`, the calendar should start on June 2026, not the current month.

Fix: initialize `year` and `month` from `booking.checkInDate` when present, falling back to today.

## Data Flow

### Popover to Sheet

The popover captures `{ date, bedId, bedLabel, lodgeId, lodgeName, roundId, roundName }` and passes these as props to `BookingSheet`, which initializes the `BookingProvider` state. No URL changes — the Sheet is a client-side overlay, not a route.

### Calendar Refresh After Booking

When the Sheet closes after a successful booking, `AvailabilityMatrixClient` re-fetches matrix data via a callback prop `onBookingComplete` passed to `BookingSheet`.

### Open Rounds Data

The availability `page.tsx` (server component) will additionally load open booking rounds for the current member and pass them to `AvailabilityMatrixClient`. The client passes them to the popover for the round selector.

## Files

### New files
- `src/app/[slug]/availability/booking-popover.tsx`
- `src/app/[slug]/availability/booking-sheet.tsx`

### Modified files
- `src/components/matrix/date-navigator.tsx` — add clickable date picker popover
- `src/app/[slug]/availability/availability-matrix-client.tsx` — replace `router.push` with popover + sheet
- `src/app/[slug]/availability/page.tsx` — load open rounds data
- `src/app/[slug]/book/steps/select-lodge-dates.tsx` — fix initial month from checkIn date
- `src/app/[slug]/book/booking-wizard.tsx` — add navigation header on standalone page

### Unchanged files
- `src/components/matrix/use-matrix-state.ts` — already has `jumpToDate`
- `src/app/[slug]/book/booking-context.tsx` — already reads URL params
- Existing `/book` route — continues working independently
