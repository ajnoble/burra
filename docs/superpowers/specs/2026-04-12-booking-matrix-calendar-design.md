# Booking Matrix Calendar Design

## Overview

A beds-x-dates matrix view for displaying availability and managing bookings. Replaces the current month-grid availability calendar and enhances the booking wizard's bed selection step. Three consumers share a core matrix component: member availability view, booking wizard step 3, and admin booking manager.

Custom-built using CSS Grid + @dnd-kit + shadcn/ui. No commercial calendar library.

## Component Architecture

### Shared Core: `<BookingMatrix />`

A single core component rendering the beds-x-dates CSS Grid, configured via props for each consumer.

```
<BookingMatrix>
  <MatrixHeader />          — sticky date row across the top
  <RoomGroup />             — collapsible room section
    <RoomHeader />          — room name + collapse toggle + capacity indicator
    <BedRow />              — one row per bed
      <BookingBar />        — horizontal bar spanning check-in to check-out
        <BookingPopover />  — details on hover (desktop) / tap (mobile)
  <DateNavigator />         — prev/next controls + "today" button + date picker jump
```

### Three Consumers

**1. Member Availability View** (`/[slug]/availability`)
- Read-only matrix with colour-coded cells (green=available, amber=held, red=booked, grey=closed)
- No booking bars or guest names — just cell colours
- Hover tooltip: "Room 1 - Bed A, Apr 5 — Available"
- Click available cell or drag across range to pre-fill booking wizard via query params
- Mobile default: date-first list view with room/bed availability for selected range
- Mobile toggle: switch to compressed 7-day grid view
- Replaces the current `/[slug]/availability` month-grid calendar

**2. Booking Wizard Step 3** (`/[slug]/book` → SelectBeds)
- Focused matrix showing only the selected date range (from step 1, typically 2-14 days)
- Cells: available (green, clickable), booked (red), held-by-you (blue with guest name), held-by-others (amber)
- Click available cell → guest assignment dropdown (bottom sheet on mobile)
- Clicking one cell assigns the guest to the full stay on that bed (not per-night)
- Guest colour coding (existing 6-colour system) on booking bars
- Hold timer display from booking round's `holdDurationMinutes`
- Booking context, hold system, and timed expiry work exactly as they do now

**3. Admin Booking Manager** (`/[slug]/admin/bookings/calendar`)
- Full matrix with booking bars showing guest names, colour-coded by status
- Drag-and-drop interactions (desktop only — see Drag-and-Drop section)
- Hover popovers with full booking details
- Mobile: view-only matrix with tap-to-edit via bottom sheet
- Additional booking bar info: booking reference, payment status

### Shared Primitives

- **Date window logic** — startDate + visible range, responsive day count, pre-fetch ahead/behind
- **Room grouping** — collapsible room sections with nested bed rows
- **Cell rendering** — base grid cell that each consumer decorates
- **Sticky positioning** — frozen bed-name column + frozen date header

## CSS Grid Layout

### Grid Structure

- Column 1: bed label column (sticky, ~150px desktop / ~80px mobile)
- Columns 2-N: one per visible date
- Room header rows span all columns
- Bed rows contain individual cells

```
| Bed Label  | Apr 1 | Apr 2 | Apr 3 | ... | Apr 30 |
|------------|-------|-------|-------|-----|--------|
| > Room 1   |       |       |       |     |        |  <- room header, full span
|   Bed A    |  ===========  |       |     |        |  <- booking bar
|   Bed B    |       |  ====================|        |
| > Room 2   |       |       |       |     |        |
|   Bed A    |       |       |       |     |        |
```

### Sticky Behaviour

- Bed label column: `position: sticky; left: 0; z-index: 10`
- Date header row: `position: sticky; top: 0; z-index: 20`
- Corner cell (intersection): `z-index: 30` — sits above both sticky axes

### Continuous Horizontal Scroll

The grid loads the full season's date range (typically 60-90 days) and is freely scrollable horizontally. Users scroll/swipe through dates naturally. The sticky bed-name column stays anchored while dates scroll.

Navigation aids:
- "Today" button snaps to current date
- Date picker jump to any date in the season
- Prev/next shortcut buttons (shift by 7/14/30 days based on breakpoint)
- Pre-fetch one window-width ahead in each direction for seamless scrolling

### Responsive Behaviour

| Breakpoint | Cell Width | Bed Label | Notes |
|---|---|---|---|
| Mobile (<640px) | ~40px | Abbreviated ("R1-A") | Min 40x40px tap targets |
| Tablet (640-1024px) | ~45px | Short ("Rm 1 - Bed A") | |
| Desktop (1024px+) | ~35-40px | Full ("Room 1 - Bed A") | |

Mobile: `overflow-x: auto` on grid container, sticky bed column stays put, swipe to navigate dates.

### Booking Bars

- Positioned via `grid-column: start / end` mapping to date columns
- Height: ~36px within bed row
- Colour-coded by status: confirmed=blue, pending=amber, held-by-you=green, cancelled=grey
- Truncated guest name label inside
- Bars extending beyond visible window show clip indicators (arrow/fade) at the edge

## Drag-and-Drop System (Admin Only)

### Library

`@dnd-kit/core` with pointer sensor (desktop only). No drag sensors on mobile.

### Five Interaction Types

**1. Move to different bed (vertical drag)**
- Drag booking bar up/down to different bed row
- Drop targets highlight: valid=green, occupied=red
- On drop: calls `reassignBeds` server action

**2. Move to different dates (horizontal drag)**
- Drag booking bar left/right along same bed row
- Ghost preview shows new dates during drag
- On drop: calls `modifyDates` server action, triggers price recalculation

**3. Resize (change duration)**
- Left edge handle: change check-in date
- Right edge handle: change check-out date
- Minimum 1 night enforced
- On release: calls `modifyDates`, triggers price recalculation

**4. Drag to create**
- Click and drag across empty cells in a bed row
- Selection highlight shows date range
- On release: opens "quick create" modal pre-filled with bed and dates, admin searches for member

**5. Multi-guest move**
- Ctrl+click (or long-press) to select multiple booking bars from the same booking
- Drag the group — all bars move together maintaining relative bed positions
- On drop: reassigns all guests in single transaction

### Validation

Every drag operation validates before committing:
- Overlap check — no double-booking (unless same booking)
- Availability override check — no booking onto closed/reduced dates
- Season boundary check — stays within booking round's season dates
- Invalid drop: bar snaps back with toast explaining why

### Optimistic Updates

1. Grid updates immediately on drop
2. Server action fires in background
3. On success: refetch to confirm, show price notification ("Price updated: $450 -> $520")
4. On failure: snap bar back, show error toast

### Admin Mobile (No Drag)

- Tap booking bar -> bottom sheet with guest info, dates, bed, status, price
- Action buttons: "Move to different bed", "Change dates", "Cancel booking"
- "Move to different bed" -> bed picker. "Change dates" -> date range picker
- Same server actions, form-driven instead of drag-driven

## Member Availability View — Mobile

### Default: Date-First List

1. Date range picker at top
2. Member selects check-in and check-out
3. Room/bed list appears below:
   ```
   > Room 1 (2 of 4 available)
     Bed A - Available        [Book ->]
     Bed B - Available        [Book ->]
     Bed C - Booked
     Bed D - Booked
   > Room 2 (3 of 3 available)
     ...
   ```
4. Tapping "Book ->" links to booking wizard pre-filled with dates and bed

### Toggle: Grid View

Header toggle ("List | Grid") switches to compressed 7-day matrix. Same colour-coded cells, sticky bed column, horizontal swipe. Power-user option, not the default.

## Data Fetching

### New Server Action: `getMatrixData`

Single action returning all data for a lodge and date range:

```typescript
getMatrixData(lodgeId: string, startDate: Date, endDate: Date) -> {
  rooms: Array<{
    id: string
    name: string
    floor: number | null
    beds: Array<{ id: string; label: string; sortOrder: number }>
  }>
  bookings: Array<{
    id: string              // bookingGuest ID
    bookingId: string
    guestName: string
    bedId: string
    checkIn: Date
    checkOut: Date
    status: BookingStatus
    membershipClass: string | null
    // Admin-only fields (conditionally included):
    bookingReference?: string
    paymentStatus?: string
    totalAmountCents?: number
    hasAdminNotes?: boolean
  }>
  overrides: Array<{
    startDate: Date
    endDate: Date
    type: 'CLOSURE' | 'REDUCTION' | 'EVENT'
    reason: string | null
    bedReduction?: number
  }>
  holds: Array<{
    bedId: string
    checkIn: Date
    checkOut: Date
    memberId: string
    expiresAt: Date
  }>
}
```

Admin vs member data distinguished by role check within the action.

### Client State

React context or `useReducer`:
- `visibleStartDate` — left edge of scroll window
- `collapsedRooms` — set of collapsed room IDs
- `selectedBookings` — selected booking IDs for multi-move (admin)
- `dragState` — current drag operation
- `viewMode` — "grid" | "list" (mobile toggle for member view)

### Refetching Strategy

- **On scroll:** pre-fetch one window-width ahead in each direction
- **On mutation:** refetch affected date range after drag-drop completes
- **No polling:** point-in-time snapshot with "last updated X ago" indicator and refresh button

## Testing Strategy

### Unit Tests (Vitest) — ~15-25 tests

- Date window logic: visible columns, responsive breakpoints, scroll-to-date mapping
- Grid position calculations: booking check-in/check-out to grid column start/end
- Overlap detection: validating drag target conflicts with existing bookings
- Booking bar clipping: bars extending beyond visible window
- Room grouping/collapsing: correct beds shown/hidden per collapse state

### Integration Tests (Vitest + pglite) — ~8-12 tests

- `getMatrixData` action: correct rooms, bookings, overrides, holds for date range
- Drag-move validation: server-side overlap, season boundary, override checks
- Price recalculation on move: correct repricing with weekday/weekend rates, multi-night discounts
- Concurrency: two admins moving to same bed simultaneously, one fails gracefully
- Hold integration: wizard bed holds appear in matrix data

### E2E Tests (Playwright) — ~6-8 tests

- Member availability view: load matrix, verify colour coding, click to enter wizard
- Mobile list/grid toggle: switch views, verify correct rendering
- Booking wizard step 3: assign guest via matrix click, verify hold, complete booking
- Admin matrix: load with bookings, verify bar positions
- Admin drag-move: drag to different bed, verify move and price notification
- Admin resize: drag edge to extend, verify new dates
- Admin mobile tap-to-edit: tap booking, verify bottom sheet, change bed via picker

## Dependencies

### New npm packages
- `@dnd-kit/core` — drag-and-drop primitives
- `@dnd-kit/utilities` — helper hooks

### Existing packages (no additions needed)
- `date-fns` / `date-fns-tz` — date calculations
- shadcn/ui — popover, tooltip, sheet, button, badge components
- Tailwind CSS — all styling

## Pages & Routes

- `/[slug]/availability` — updated to use BookingMatrix (replaces current month grid)
- `/[slug]/book` step 3 — updated to use focused BookingMatrix
- `/[slug]/admin/bookings/calendar` — new route for admin matrix view
- Existing `/[slug]/admin/bookings` list view remains unchanged as an alternative admin view
