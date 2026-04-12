# Calendar Booking UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the availability calendar UX by adding a date picker to the navigator, replacing the navigate-away booking flow with a popover + sheet drawer, and fixing the date initialization bug on the standalone `/book` page.

**Architecture:** The availability matrix cell click will open a lightweight popover (using Base UI Popover) instead of navigating to `/book`. The popover's "Start Booking" button opens a Sheet drawer containing the existing `BookingWizard`. The `DateNavigator` gets a clickable date range that opens a popover with month/year selects and a mini calendar grid. The standalone `/book` page gets a navigation header and its date initialization bug is fixed.

**Tech Stack:** Next.js 15 (App Router), React, Base UI (`@base-ui/react`), shadcn components (Sheet, Select, Button), date-fns, Vitest

**Spec:** `docs/superpowers/specs/2026-04-12-calendar-booking-ux-design.md`

**Testing docs:** `docs/testing.md` — unit tests for pure functions, no DB mocks

**Next.js docs:** `node_modules/next/dist/docs/` — check before writing any Next.js-specific code

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/components/ui/popover.tsx` | Shadcn-style Popover wrapper around Base UI Popover primitive |
| `src/components/matrix/date-picker-popover.tsx` | Date navigator's picker: month/year selects + mini calendar grid |
| `src/components/matrix/__tests__/date-picker-popover.test.tsx` | Unit tests for the date picker popover |
| `src/app/[slug]/availability/booking-popover.tsx` | Cell click popover showing date, bed, lodge, round selector |
| `src/app/[slug]/availability/booking-sheet.tsx` | Sheet drawer wrapping BookingWizard for in-calendar booking |

### Modified files
| File | Changes |
|------|---------|
| `src/components/matrix/date-navigator.tsx` | Replace static date text with clickable button opening DatePickerPopover |
| `src/components/matrix/booking-matrix.tsx` | Extend `onCellClick` to include `bedLabel` parameter |
| `src/components/matrix/bed-row.tsx` | Pass `bed.label` through `onCellClick` callback |
| `src/components/matrix/room-group.tsx` | Forward new `onCellClick` signature |
| `src/app/[slug]/availability/availability-matrix-client.tsx` | Replace `router.push` with popover + sheet state management; accept `openRounds` prop |
| `src/app/[slug]/availability/page.tsx` | Load open booking rounds + member session; pass to client |
| `src/app/[slug]/book/steps/select-lodge-dates.tsx` | Initialize `year`/`month` from `booking.checkInDate` |
| `src/app/[slug]/book/booking-wizard.tsx` | Accept optional `slug` prop; add nav header in standalone mode |
| `src/app/[slug]/book/page.tsx` | Pass `slug` to `BookingWizard` |

---

## Task 1: Create Popover UI Component

Base UI has a Popover primitive (`@base-ui/react/popover`). We need a shadcn-style wrapper following the same patterns as the existing `sheet.tsx` and `dialog.tsx`.

**Files:**
- Create: `src/components/ui/popover.tsx`

- [ ] **Step 1: Read Base UI Popover docs**

Read: `node_modules/@base-ui/react/popover/index.d.ts` to understand the API surface (Root, Trigger, Portal, Positioner, Popup, Arrow, Backdrop, Title, Description, Close).

- [ ] **Step 2: Create the Popover component**

```tsx
// src/components/ui/popover.tsx
"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverPortal({ ...props }: PopoverPrimitive.Portal.Props) {
  return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />;
}

function PopoverContent({
  className,
  sideOffset = 8,
  align = "center",
  side = "bottom",
  children,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "sideOffset" | "side"
  >) {
  return (
    <PopoverPortal>
      <PopoverPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "w-auto rounded-lg border bg-popover p-4 text-popover-foreground shadow-md outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPortal>
  );
}

function PopoverClose({ ...props }: PopoverPrimitive.Close.Props) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverClose };
```

- [ ] **Step 3: Verify it builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors in `popover.tsx`

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/popover.tsx
git commit -m "feat: add Popover UI component wrapping Base UI primitive"
```

---

## Task 2: Fix Date Initialization Bug on Standalone `/book` Page

**Files:**
- Modify: `src/app/[slug]/book/steps/select-lodge-dates.tsx:69-73`

- [ ] **Step 1: Write the fix**

In `src/app/[slug]/book/steps/select-lodge-dates.tsx`, replace the `year` and `month` state initialization (lines 69-73):

```tsx
// Old:
const [checkIn, setCheckIn] = useState<string | null>(booking.checkInDate);
const [checkOut, setCheckOut] = useState<string | null>(booking.checkOutDate);
const [availability, setAvailability] = useState<AvailabilityDay[]>([]);
const [year, setYear] = useState(new Date().getFullYear());
const [month, setMonth] = useState(new Date().getMonth() + 1);
```

```tsx
// New:
const [checkIn, setCheckIn] = useState<string | null>(booking.checkInDate);
const [checkOut, setCheckOut] = useState<string | null>(booking.checkOutDate);
const [availability, setAvailability] = useState<AvailabilityDay[]>([]);
const [year, setYear] = useState(() => {
  if (booking.checkInDate) {
    return parseInt(booking.checkInDate.slice(0, 4), 10);
  }
  return new Date().getFullYear();
});
const [month, setMonth] = useState(() => {
  if (booking.checkInDate) {
    return parseInt(booking.checkInDate.slice(5, 7), 10);
  }
  return new Date().getMonth() + 1;
});
```

- [ ] **Step 2: Verify it builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/book/steps/select-lodge-dates.tsx
git commit -m "fix: initialize booking calendar month from checkIn date query param"
```

---

## Task 3: Add Navigation Header to Standalone `/book` Page

**Files:**
- Modify: `src/app/[slug]/book/booking-wizard.tsx`
- Modify: `src/app/[slug]/book/page.tsx`

- [ ] **Step 1: Add `slug` prop to BookingWizard and render nav header**

In `src/app/[slug]/book/booking-wizard.tsx`, the `Props` type already has `slug: string`. Add a navigation header above the step indicator. Update `WizardContent`:

```tsx
// At top of file, add imports:
import Link from "next/link";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
```

Note: The Button component uses Base UI's `render` prop pattern, not `asChild`. For link-buttons, use `Link` with `buttonVariants()` classnames (same pattern as `quick-create-dialog.tsx`).

In the `WizardContent` component, add a `showNav` prop to distinguish standalone vs sheet mode. Update `Props` type:

```tsx
type Props = {
  organisationId: string;
  slug: string;
  lodges: Lodge[];
  seasons: Season[];
  openRounds: OpenRound[];
  memberId: string;
  memberName: string;
  membershipClassId: string;
  /** When false (sheet mode), hides the nav header. Defaults to true. */
  showNav?: boolean;
};
```

Update `WizardContent` to accept and use `showNav` and `slug`:

```tsx
function WizardContent({
  organisationId,
  slug,
  lodges,
  seasons,
  openRounds,
  memberId,
  memberName,
  membershipClassId,
  showNav = true,
}: Props) {
  const { step, bookingReference } = useBooking();

  if (bookingReference) {
    return <BookingSuccess slug={slug} />;
  }

  return (
    <div>
      {showNav && (
        <nav className="flex items-center gap-3 mb-6 text-sm">
          <Link
            href={`/${slug}/availability`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1")}
          >
            <ArrowLeft className="size-4" />
            Back to Calendar
          </Link>
          <Link
            href={`/${slug}`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1")}
          >
            <LayoutDashboard className="size-4" />
            Dashboard
          </Link>
        </nav>
      )}

      <StepIndicator currentStep={step} />

      {step === 1 && (
        <SelectLodgeDates
          lodges={lodges}
          seasons={seasons}
          openRounds={openRounds}
          slug={slug}
          memberId={memberId}
        />
      )}
      {step === 2 && (
        <AddGuests
          organisationId={organisationId}
          memberId={memberId}
          memberName={memberName}
          membershipClassId={membershipClassId}
          slug={slug}
        />
      )}
      {step === 3 && (
        <SelectBeds
          organisationId={organisationId}
          memberId={memberId}
          slug={slug}
        />
      )}
      {step === 4 && (
        <ReviewPricing
          organisationId={organisationId}
          lodges={lodges}
        />
      )}
      {step === 5 && (
        <Confirm
          organisationId={organisationId}
          slug={slug}
          lodges={lodges}
        />
      )}
    </div>
  );
}
```

Also pass `showNav` through in the `BookingWizard` wrapper:

```tsx
export function BookingWizard(props: Props) {
  return (
    <Suspense fallback={<div className="p-4 text-muted-foreground">Loading...</div>}>
      <BookingProvider>
        <WizardContent {...props} />
      </BookingProvider>
    </Suspense>
  );
}
```

- [ ] **Step 2: Verify link-button pattern works**

The Button component does NOT support `asChild`. Use `Link` with `className={cn(buttonVariants(...))}` — the same pattern used in `quick-create-dialog.tsx`.

- [ ] **Step 3: Verify it builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/book/booking-wizard.tsx
git commit -m "feat: add navigation header to standalone /book page"
```

---

## Task 4: Date Picker Popover for Date Navigator

**Files:**
- Create: `src/components/matrix/date-picker-popover.tsx`
- Create: `src/components/matrix/__tests__/date-picker-popover.test.tsx`
- Modify: `src/components/matrix/date-navigator.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/matrix/__tests__/date-picker-popover.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { getYearRange, MONTH_NAMES } from "../date-picker-popover";

describe("date-picker-popover helpers", () => {
  it("getYearRange returns 3 years centred on current year", () => {
    const range = getYearRange(2026);
    expect(range).toEqual([2024, 2025, 2026, 2027, 2028]);
  });

  it("getYearRange includes seasonEnd year when it extends beyond default range", () => {
    const range = getYearRange(2026, undefined, "2030-06-01");
    expect(range[range.length - 1]).toBe(2030);
  });

  it("MONTH_NAMES has 12 entries starting with January", () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_NAMES[0]).toBe("January");
    expect(MONTH_NAMES[11]).toBe("December");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/matrix/__tests__/date-picker-popover.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create the DatePickerPopover component**

Create `src/components/matrix/date-picker-popover.tsx`:

```tsx
"use client";

import { useState } from "react";
import { format, parseISO, getDaysInMonth, startOfMonth, getDay, addDays } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * Build a year range: 2 years before currentYear through 2 years after,
 * extended to include season boundaries if provided.
 */
export function getYearRange(
  currentYear: number,
  seasonStartDate?: string,
  seasonEndDate?: string,
): number[] {
  let min = currentYear - 2;
  let max = currentYear + 2;

  if (seasonStartDate) {
    const sYear = parseInt(seasonStartDate.slice(0, 4), 10);
    if (sYear < min) min = sYear;
  }
  if (seasonEndDate) {
    const eYear = parseInt(seasonEndDate.slice(0, 4), 10);
    if (eYear > max) max = eYear;
  }

  const years: number[] = [];
  for (let y = min; y <= max; y++) years.push(y);
  return years;
}

type Props = {
  /** Current start date shown in the matrix (YYYY-MM-DD) */
  startDate: string;
  /** Current end date shown in the matrix (YYYY-MM-DD) */
  endDate: string;
  /** Called when the user picks a date — jumps the matrix to that date */
  onDateSelect: (date: string) => void;
  /** Optional season start for disabling out-of-range dates */
  seasonStartDate?: string;
  /** Optional season end for disabling out-of-range dates */
  seasonEndDate?: string;
};

export function DatePickerPopover({
  startDate,
  endDate,
  onDateSelect,
  seasonStartDate,
  seasonEndDate,
}: Props) {
  const [open, setOpen] = useState(false);

  // Initialize picker month/year from the matrix's current start date
  const [pickerYear, setPickerYear] = useState(() =>
    parseInt(startDate.slice(0, 4), 10)
  );
  const [pickerMonth, setPickerMonth] = useState(() =>
    parseInt(startDate.slice(5, 7), 10)
  );

  const startLabel = format(parseISO(startDate), "d MMM yyyy");
  const endLabel = format(parseISO(endDate), "d MMM yyyy");

  const currentYear = new Date().getFullYear();
  const yearOptions = getYearRange(currentYear, seasonStartDate, seasonEndDate);

  // Build the mini calendar grid for pickerYear/pickerMonth
  const daysInMonth = getDaysInMonth(new Date(pickerYear, pickerMonth - 1));
  const firstDayOfWeek = getDay(startOfMonth(new Date(pickerYear, pickerMonth - 1)));
  const today = format(new Date(), "yyyy-MM-dd");

  function handleDateClick(day: number) {
    const dateStr = `${pickerYear}-${String(pickerMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onDateSelect(dateStr);
    setOpen(false);
  }

  function isDisabled(day: number): boolean {
    const dateStr = `${pickerYear}-${String(pickerMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (seasonStartDate && dateStr < seasonStartDate) return true;
    if (seasonEndDate && dateStr > seasonEndDate) return true;
    return false;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" />
        }
      >
        <CalendarDays className="size-4 shrink-0" />
        <span>
          {startLabel} – {endLabel}
        </span>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-3">
        {/* Month / Year selectors */}
        <div className="flex items-center gap-2 mb-3">
          <Select
            value={String(pickerMonth)}
            onValueChange={(v) => { if (v) setPickerMonth(Number(v)); }}
          >
            <SelectTrigger size="sm" className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(pickerYear)}
            onValueChange={(v) => { if (v) setPickerYear(Number(v)); }}
          >
            <SelectTrigger size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 gap-0 mb-1">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-0">
          {/* Empty cells for days before the 1st */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="h-8" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${pickerYear}-${String(pickerMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const disabled = isDisabled(day);
            const isToday = dateStr === today;

            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                onClick={() => handleDateClick(day)}
                className={`h-8 w-full rounded text-sm transition-colors
                  ${disabled ? "text-muted-foreground/40 cursor-not-allowed" : "hover:bg-accent cursor-pointer"}
                  ${isToday ? "font-bold text-primary" : ""}
                `}
              >
                {day}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/matrix/__tests__/date-picker-popover.test.tsx`
Expected: PASS — 3 tests pass

- [ ] **Step 5: Update DateNavigator to use DatePickerPopover**

In `src/components/matrix/date-navigator.tsx`, replace the static date display with the new component. The `MatrixState` type already exposes `jumpToDate`, and `useMatrixState` already has `seasonStartDate`/`seasonEndDate` in its options. We need to pass them through.

First, update `DateNavigator` props to accept optional season dates:

```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePickerPopover } from "./date-picker-popover";
import type { MatrixState } from "./use-matrix-state";

type Props = {
  state: MatrixState;
  seasonStartDate?: string;
  seasonEndDate?: string;
};

export function DateNavigator({ state, seasonStartDate, seasonEndDate }: Props) {
  const { startDate, endDate, navigateBackward, navigateForward, jumpToToday, jumpToDate } =
    state;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-background">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={navigateBackward}
        aria-label="Previous period"
      >
        <ChevronLeft />
      </Button>

      <Button
        variant="outline"
        size="icon-sm"
        onClick={navigateForward}
        aria-label="Next period"
      >
        <ChevronRight />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={jumpToToday}
        aria-label="Jump to today"
      >
        Today
      </Button>

      <DatePickerPopover
        startDate={startDate}
        endDate={endDate}
        onDateSelect={jumpToDate}
        seasonStartDate={seasonStartDate}
        seasonEndDate={seasonEndDate}
      />
    </div>
  );
}
```

- [ ] **Step 6: Pass season dates through BookingMatrix to DateNavigator**

In `src/components/matrix/booking-matrix.tsx`, add `seasonStartDate` and `seasonEndDate` to the Props type:

```tsx
// Add to Props type:
  /** Season start date for date navigator bounds */
  seasonStartDate?: string;
  /** Season end date for date navigator bounds */
  seasonEndDate?: string;
```

Pass them to `DateNavigator`:

```tsx
<DateNavigator
  state={state}
  seasonStartDate={seasonStartDate}
  seasonEndDate={seasonEndDate}
/>
```

Add them to the destructured props in the component signature.

- [ ] **Step 7: Pass season dates from AvailabilityMatrixClient**

In `src/app/[slug]/availability/availability-matrix-client.tsx`, the `seasonStartDate` and `seasonEndDate` props already exist. Pass them through to `BookingMatrix`:

```tsx
<BookingMatrix
  data={data}
  state={state}
  onCellClick={handleCellClick}
  abbreviateLabels={breakpoint !== "desktop"}
  seasonStartDate={seasonStartDate}
  seasonEndDate={seasonEndDate}
/>
```

- [ ] **Step 8: Verify it builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add src/components/matrix/date-picker-popover.tsx \
  src/components/matrix/__tests__/date-picker-popover.test.tsx \
  src/components/matrix/date-navigator.tsx \
  src/components/matrix/booking-matrix.tsx \
  src/app/[slug]/availability/availability-matrix-client.tsx
git commit -m "feat: add clickable date picker to matrix date navigator"
```

---

## Task 5: Extend onCellClick to Include Bed Label

The popover needs to display the bed label. Currently `onCellClick` only passes `(bedId, date)`. We need to add `bedLabel`.

**Files:**
- Modify: `src/components/matrix/booking-matrix.tsx` (Props type)
- Modify: `src/components/matrix/room-group.tsx`
- Modify: `src/components/matrix/bed-row.tsx`
- Modify: `src/app/[slug]/availability/availability-matrix-client.tsx`

- [ ] **Step 1: Update the onCellClick type in BookingMatrix**

In `src/components/matrix/booking-matrix.tsx`, change the `onCellClick` prop type:

```tsx
// Old:
onCellClick?: (bedId: string, date: string) => void;
// New:
onCellClick?: (bedId: string, date: string, bedLabel: string) => void;
```

- [ ] **Step 2: Update BedRow to pass bed.label**

In `src/components/matrix/bed-row.tsx`, find where `onCellClick` is called. It will be in the cell's onClick handler. Update it to pass `bed.label` as the third argument:

```tsx
// Old:
onCellClick?.(bed.id, date);
// New:
onCellClick?.(bed.id, date, bed.label);
```

- [ ] **Step 3: Update RoomGroup to forward the new signature**

In `src/components/matrix/room-group.tsx`, the `onCellClick` prop type needs to match. Update the type:

```tsx
// Old:
onCellClick?: (bedId: string, date: string) => void;
// New:
onCellClick?: (bedId: string, date: string, bedLabel: string) => void;
```

- [ ] **Step 4: Update AvailabilityMatrixClient handleCellClick**

In `src/app/[slug]/availability/availability-matrix-client.tsx`, update `handleCellClick`:

```tsx
// Old:
function handleCellClick(bedId: string, date: string) {
  const params = new URLSearchParams({ checkIn: date, bed: bedId });
  router.push(`/${slug}/book?${params.toString()}`);
}
// New (temporary — will be replaced in Task 7 with popover logic):
function handleCellClick(bedId: string, date: string, bedLabel: string) {
  const params = new URLSearchParams({ checkIn: date, bed: bedId });
  router.push(`/${slug}/book?${params.toString()}`);
}
```

- [ ] **Step 5: Check for other callers of onCellClick**

Search the codebase for other components that pass `onCellClick` to `BookingMatrix`. The admin matrix client (`admin-matrix-client.tsx`) may also use it. If so, update its handler signature to accept the third parameter (it can ignore it with `_bedLabel`).

Run: `grep -r "onCellClick" src/ --include="*.tsx" -l`

Update any other callers found.

- [ ] **Step 6: Verify it builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/components/matrix/booking-matrix.tsx \
  src/components/matrix/bed-row.tsx \
  src/components/matrix/room-group.tsx \
  src/app/[slug]/availability/availability-matrix-client.tsx
git commit -m "refactor: extend onCellClick callback to include bedLabel"
```

If other files were changed (e.g., admin-matrix-client.tsx), include them in the commit too.

---

## Task 6: Load Open Rounds in Availability Page

The availability page needs to load open booking rounds so the popover can show a round selector.

**Files:**
- Modify: `src/app/[slug]/availability/page.tsx`
- Modify: `src/app/[slug]/availability/availability-matrix-client.tsx` (Props type only)

- [ ] **Step 1: Update the availability page server component**

In `src/app/[slug]/availability/page.tsx`, add session and booking round loading. Reference the pattern from `src/app/[slug]/book/page.tsx` lines 21-124 for how to load member session and open rounds.

```tsx
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/index";
import { lodges, seasons, bookingRounds, members } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { AvailabilityMatrixClient } from "./availability-matrix-client";
import { LodgeSelector } from "./lodge-selector";

export default async function MemberAvailabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);

  const [orgLodges, activeSeasons] = await Promise.all([
    db
      .select({ id: lodges.id, name: lodges.name, totalBeds: lodges.totalBeds })
      .from(lodges)
      .where(and(eq(lodges.organisationId, org.id), eq(lodges.isActive, true))),
    db
      .select({
        id: seasons.id,
        name: seasons.name,
        startDate: seasons.startDate,
        endDate: seasons.endDate,
      })
      .from(seasons)
      .where(
        and(eq(seasons.organisationId, org.id), eq(seasons.isActive, true))
      ),
  ]);

  if (orgLodges.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Availability</h1>
        <p className="text-muted-foreground">
          No lodges available at the moment.
        </p>
      </div>
    );
  }

  const selectedLodgeId =
    typeof sp.lodge === "string" ? sp.lodge : orgLodges[0].id;

  const selectedLodge =
    orgLodges.find((l) => l.id === selectedLodgeId) ?? orgLodges[0];

  const activeSeason = activeSeasons[0];

  // Load open booking rounds (only if member is logged in and financial)
  type OpenRound = {
    id: string;
    name: string;
    seasonId: string;
    opensAt: Date;
    closesAt: Date;
    maxNightsPerBooking: number | null;
    maxNightsPerMember: number | null;
    holdDurationMinutes: number | null;
    requiresApproval: boolean;
  };

  let openRounds: OpenRound[] = [];
  let memberId: string | null = null;

  if (session) {
    memberId = session.memberId;

    const [member] = await db
      .select({ isFinancial: members.isFinancial, membershipClassId: members.membershipClassId })
      .from(members)
      .where(eq(members.id, session.memberId));

    if (member?.isFinancial) {
      const now = new Date();
      for (const season of activeSeasons) {
        const rounds = await db
          .select()
          .from(bookingRounds)
          .where(
            and(
              eq(bookingRounds.seasonId, season.id),
              lte(bookingRounds.opensAt, now),
              gte(bookingRounds.closesAt, now)
            )
          );
        for (const round of rounds) {
          const allowedClasses = round.allowedMembershipClassIds;
          if (
            allowedClasses.length === 0 ||
            allowedClasses.includes(member.membershipClassId)
          ) {
            openRounds.push(round);
          }
        }
      }
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Check Availability</h1>
      <p className="text-muted-foreground mb-6">
        See when beds are available at our lodges.
      </p>

      {orgLodges.length > 1 && (
        <div className="mb-6 w-64">
          <LodgeSelector
            lodges={orgLodges}
            selectedLodgeId={selectedLodge.id}
            slug={slug}
          />
        </div>
      )}

      <AvailabilityMatrixClient
        lodgeId={selectedLodge.id}
        lodgeName={selectedLodge.name}
        slug={slug}
        seasonStartDate={activeSeason?.startDate ?? undefined}
        seasonEndDate={activeSeason?.endDate ?? undefined}
        openRounds={openRounds.map((r) => ({
          id: r.id,
          name: r.name,
        }))}
        memberId={memberId ?? undefined}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update AvailabilityMatrixClient Props**

In `src/app/[slug]/availability/availability-matrix-client.tsx`, add the new props:

```tsx
type OpenRoundSummary = {
  id: string;
  name: string;
};

type Props = {
  lodgeId: string;
  lodgeName: string;
  slug: string;
  seasonStartDate?: string;
  seasonEndDate?: string;
  openRounds?: OpenRoundSummary[];
  memberId?: string;
};
```

Update the component signature to accept them (they'll be used in Task 7):

```tsx
export function AvailabilityMatrixClient({
  lodgeId,
  lodgeName,
  slug,
  seasonStartDate,
  seasonEndDate,
  openRounds = [],
  memberId,
}: Props) {
```

- [ ] **Step 3: Verify it builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/availability/page.tsx \
  src/app/[slug]/availability/availability-matrix-client.tsx
git commit -m "feat: load open booking rounds in availability page for popover"
```

---

## Task 7: Booking Popover Component

**Files:**
- Create: `src/app/[slug]/availability/booking-popover.tsx`
- Modify: `src/app/[slug]/availability/availability-matrix-client.tsx`

- [ ] **Step 1: Create the BookingPopover component**

Create `src/app/[slug]/availability/booking-popover.tsx`:

```tsx
"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OpenRoundSummary = {
  id: string;
  name: string;
};

export type BookingPopoverSelection = {
  date: string;
  bedId: string;
  bedLabel: string;
  roundId: string;
  roundName: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The anchor element ref — the popover positions relative to this */
  anchorRef: React.RefObject<HTMLElement | null>;
  date: string;
  bedId: string;
  bedLabel: string;
  lodgeName: string;
  openRounds: OpenRoundSummary[];
  onStartBooking: (selection: BookingPopoverSelection) => void;
};

export function BookingPopover({
  open,
  onOpenChange,
  anchorRef,
  date,
  bedId,
  bedLabel,
  lodgeName,
  openRounds,
  onStartBooking,
}: Props) {
  const formattedDate = format(parseISO(date), "EEEE d MMMM yyyy");
  const hasRounds = openRounds.length > 0;
  const singleRound = openRounds.length === 1;

  const [selectedRoundId, setSelectedRoundId] = useState(openRounds[0]?.id ?? "");

  function handleStartClick() {
    const round = openRounds.find((r) => r.id === selectedRoundId);
    if (!round) return;

    onStartBooking({
      date,
      bedId,
      bedLabel,
      roundId: round.id,
      roundName: round.name,
    });
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {/* Hidden trigger — we position manually via anchorRef */}
      <PopoverContent
        align="start"
        side="bottom"
        className="w-72 p-4"
        anchor={anchorRef}
      >
        <div className="space-y-3">
          <div>
            <p className="font-medium text-sm">{formattedDate}</p>
            <p className="text-sm text-muted-foreground">
              {lodgeName} &middot; {bedLabel}
            </p>
          </div>

          {!hasRounds ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              No booking rounds are currently open.
            </p>
          ) : (
            <div>
              {singleRound ? (
                <div className="rounded border p-2 text-sm mb-3">
                  <p className="font-medium">{openRounds[0].name}</p>
                </div>
              ) : (
                <div className="mb-3">
                  <label className="text-sm font-medium mb-1 block">
                    Booking Round
                  </label>
                  <Select value={selectedRoundId} onValueChange={(v) => { if (v) setSelectedRoundId(v); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select round" />
                    </SelectTrigger>
                    <SelectContent>
                      {openRounds.map((round) => (
                        <SelectItem key={round.id} value={round.id}>
                          {round.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button onClick={handleStartClick} className="w-full">
                Start Booking
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

**Note:** The Popover positioning via `anchorRef` may need adjustment depending on how Base UI's Popover handles anchor elements. Read the Base UI Popover API during implementation to confirm the correct prop name — it may be `anchor` on the Positioner rather than on `PopoverContent`. Adjust the `popover.tsx` wrapper in Task 1 accordingly if needed, or pass the anchor ref directly to the Positioner.

- [ ] **Step 2: Verify it builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors (or type adjustments needed for anchor positioning — fix inline)

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/availability/booking-popover.tsx
git commit -m "feat: add BookingPopover for calendar cell click"
```

---

## Task 8: Booking Sheet Component

**Files:**
- Create: `src/app/[slug]/availability/booking-sheet.tsx`

- [ ] **Step 1: Create the BookingSheet component**

This wraps the existing `BookingWizard` in a Sheet drawer. It needs to receive the same props that `BookingWizard` needs (loaded by the page server component), plus the popover selection data.

However, the `BookingWizard` gets its data from the page's server component. For the Sheet approach, we need to re-use the wizard components but with pre-populated context. The simplest approach: the Sheet renders a `BookingProvider` with URL search params pre-set to match the selection.

Create `src/app/[slug]/availability/booking-sheet.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button as ConfirmButton } from "@/components/ui/button";
import type { BookingPopoverSelection } from "./booking-popover";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selection: BookingPopoverSelection | null;
  slug: string;
  onBookingComplete?: () => void;
};

export function BookingSheet({
  open,
  onOpenChange,
  selection,
  slug,
  onBookingComplete,
}: Props) {
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  // Build the booking URL with pre-filled params
  const bookingUrl = selection
    ? `/${slug}/book?checkIn=${selection.date}&round=${selection.roundId}`
    : null;

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        // For now, close directly. If step tracking is added later,
        // show confirmation when past step 1.
        onOpenChange(false);
      } else {
        onOpenChange(true);
      }
    },
    [onOpenChange]
  );

  if (!selection) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="sm:max-w-[640px] w-full overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>New Booking</SheetTitle>
            <SheetDescription>
              {selection.bedLabel} &middot; {selection.date} &middot; {selection.roundName}
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4">
            {bookingUrl && (
              <iframe
                src={bookingUrl}
                className="w-full border-0 min-h-[calc(100vh-120px)]"
                title="Booking wizard"
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={showConfirmClose} onOpenChange={setShowConfirmClose}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Discard booking?</DialogTitle>
            <DialogDescription>
              You have an in-progress booking. Closing will discard your changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <ConfirmButton variant="outline" onClick={() => setShowConfirmClose(false)}>
              Continue Booking
            </ConfirmButton>
            <ConfirmButton
              variant="destructive"
              onClick={() => {
                setShowConfirmClose(false);
                onOpenChange(false);
              }}
            >
              Discard
            </ConfirmButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

**Important implementation note:** Using an iframe is the simplest approach since the `/book` page already handles its own data loading (session, lodges, rounds). A more integrated approach would extract the wizard's data loading into a shared function and render `BookingWizard` directly in the sheet — but that requires significant refactoring of the page server component. The iframe approach works correctly and can be upgraded later.

During implementation, verify that:
1. The confirmation dialog uses the existing `Dialog` component from `src/components/ui/dialog.tsx` (there is no AlertDialog in this codebase).
2. The `/book` page renders correctly in an iframe. If the page has a layout wrapper with headers/nav that looks odd, pass a `?embed=true` query param and conditionally hide the page chrome.

- [ ] **Step 2: Verify it builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors (fix any missing component imports)

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/availability/booking-sheet.tsx
git commit -m "feat: add BookingSheet drawer for in-calendar booking flow"
```

---

## Task 9: Wire Everything Together in AvailabilityMatrixClient

**Files:**
- Modify: `src/app/[slug]/availability/availability-matrix-client.tsx`

- [ ] **Step 1: Add popover and sheet state management**

Replace the current `handleCellClick` that navigates away with state-driven popover + sheet flow:

```tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BookingMatrix, useMatrixState, useBreakpoint } from "@/components/matrix";
import { AvailabilityList } from "./availability-list";
import { getMatrixData, type MatrixData } from "@/actions/bookings/matrix";
import { Button } from "@/components/ui/button";
import { BookingPopover, type BookingPopoverSelection } from "./booking-popover";
import { BookingSheet } from "./booking-sheet";

type OpenRoundSummary = {
  id: string;
  name: string;
};

type Props = {
  lodgeId: string;
  lodgeName: string;
  slug: string;
  seasonStartDate?: string;
  seasonEndDate?: string;
  openRounds?: OpenRoundSummary[];
  memberId?: string;
};

type CellSelection = {
  bedId: string;
  bedLabel: string;
  date: string;
};

export function AvailabilityMatrixClient({
  lodgeId,
  lodgeName,
  slug,
  seasonStartDate,
  seasonEndDate,
  openRounds = [],
  memberId,
}: Props) {
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === "mobile";

  const state = useMatrixState({
    breakpoint,
    seasonStartDate,
    seasonEndDate,
  });

  const [showList, setShowList] = useState(isMobile);

  useEffect(() => {
    if (!isMobile) {
      setShowList(false);
    }
  }, [isMobile]);

  const [data, setData] = useState<MatrixData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const result = await getMatrixData(lodgeId, state.startDate, state.endDate);
      setData(result);
    } catch {
      setFetchError("Failed to load availability data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [lodgeId, state.startDate, state.endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Popover state ---
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [cellSelection, setCellSelection] = useState<CellSelection | null>(null);
  const popoverAnchorRef = useRef<HTMLElement | null>(null);

  // --- Sheet state ---
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSelection, setSheetSelection] = useState<BookingPopoverSelection | null>(null);

  function handleCellClick(bedId: string, date: string, bedLabel: string) {
    // Store a reference to the clicked cell for popover positioning
    // The click event target can serve as the anchor
    const target = document.activeElement as HTMLElement;
    popoverAnchorRef.current = target;

    setCellSelection({ bedId, bedLabel, date });
    setPopoverOpen(true);
  }

  function handleStartBooking(selection: BookingPopoverSelection) {
    setPopoverOpen(false);
    setSheetSelection(selection);
    setSheetOpen(true);
  }

  function handleBookingComplete() {
    setSheetOpen(false);
    setSheetSelection(null);
    // Refresh calendar data
    fetchData();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{lodgeName}</h2>

        {isMobile && (
          <div className="flex items-center border rounded-md overflow-hidden text-sm">
            <button
              type="button"
              className={`px-3 py-1.5 transition-colors ${
                showList
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => setShowList(true)}
              aria-pressed={showList}
            >
              List
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 transition-colors ${
                !showList
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => setShowList(false)}
              aria-pressed={!showList}
            >
              Grid
            </button>
          </div>
        )}
      </div>

      {showList && isMobile && (
        <AvailabilityList
          lodgeId={lodgeId}
          slug={slug}
          seasonStartDate={seasonStartDate}
          seasonEndDate={seasonEndDate}
        />
      )}

      {!showList && (
        <div className="space-y-4">
          {fetchError && (
            <div className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <span>{fetchError}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={fetchData}
                className="ml-auto"
              >
                Retry
              </Button>
            </div>
          )}

          {isLoading && (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              Loading availability...
            </div>
          )}

          {data && !isLoading && (
            <div className="h-[500px]">
              <BookingMatrix
                data={data}
                state={state}
                onCellClick={handleCellClick}
                abbreviateLabels={breakpoint !== "desktop"}
                seasonStartDate={seasonStartDate}
                seasonEndDate={seasonEndDate}
              />
            </div>
          )}

          {/* Color legend */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-green-500" />
              Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
              Booked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
              Held
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-gray-400" />
              Closed
            </span>
          </div>
        </div>
      )}

      {/* Booking popover — shown when a cell is clicked */}
      {cellSelection && (
        <BookingPopover
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          anchorRef={popoverAnchorRef}
          date={cellSelection.date}
          bedId={cellSelection.bedId}
          bedLabel={cellSelection.bedLabel}
          lodgeName={lodgeName}
          openRounds={openRounds}
          onStartBooking={handleStartBooking}
        />
      )}

      {/* Booking sheet drawer */}
      <BookingSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        selection={sheetSelection}
        slug={slug}
        onBookingComplete={handleBookingComplete}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/availability/availability-matrix-client.tsx
git commit -m "feat: wire booking popover and sheet drawer into availability calendar"
```

---

## Task 10: Manual Testing & Polish

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Test the date navigator picker**

Navigate to the availability calendar page. Verify:
- The date range text is clickable
- Clicking it opens a popover with month/year selects and a mini calendar
- Selecting a month/year updates the mini calendar view
- Clicking a day jumps the matrix to that date
- The popover closes after selecting a date
- Arrow buttons and "Today" button still work

- [ ] **Step 3: Test the booking popover**

Click on an available (green) cell in the matrix. Verify:
- A popover appears showing the date, bed label, lodge name
- If multiple rounds exist, a dropdown is shown; if one, it's displayed as text
- "Start Booking" button is present
- Clicking a different cell updates the popover (doesn't open a second one)
- Clicking a booked/held cell does nothing (or the popover doesn't appear for non-available cells)

- [ ] **Step 4: Test the booking sheet**

Click "Start Booking" in the popover. Verify:
- A sheet slides in from the right
- The booking wizard loads with the date pre-filled
- The wizard steps work correctly inside the sheet
- Closing the sheet (X button or clicking overlay) dismisses it
- On mobile, the sheet takes full width

- [ ] **Step 5: Test the standalone /book page**

Navigate directly to `/{slug}/book`. Verify:
- "Back to Calendar" and "Dashboard" links appear at the top
- Clicking "Back to Calendar" returns to the availability page
- Navigate to `/{slug}/book?checkIn=2026-08-15` and verify the calendar starts on August 2026

- [ ] **Step 6: Fix any issues found**

Address any visual, functional, or type issues discovered during testing. Common things to watch for:
- Popover positioning relative to the clicked cell
- Sheet width on different screen sizes
- Iframe loading state (may need a loading spinner)
- Z-index conflicts between popover and sheet

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: All existing tests pass, new date-picker-popover tests pass

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish calendar booking UX after manual testing"
```

---

## Task 11: Handle Edge Case — Non-Available Cell Clicks

Currently the `onCellClick` fires for all cells. We need to ensure the popover only appears for available cells.

**Files:**
- Modify: `src/components/matrix/bed-row.tsx`

- [ ] **Step 1: Check how cell clicks are currently gated**

Read `src/components/matrix/bed-row.tsx` to find where `onCellClick` is invoked. It should only fire when the cell status is "available". If it already gates on status, no change needed. If not:

- [ ] **Step 2: Gate onCellClick to available cells only**

In the cell's onClick handler in `bed-row.tsx`, wrap the `onCellClick` call:

```tsx
// Only trigger cell click for available cells
if (status === "available" && onCellClick) {
  onCellClick(bed.id, date, bed.label);
}
```

- [ ] **Step 3: Verify it builds and test**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/matrix/bed-row.tsx
git commit -m "fix: only show booking popover for available cells"
```
