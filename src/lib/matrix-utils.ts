import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export type Breakpoint = "mobile" | "tablet" | "desktop";

export type GridColumns = {
  colStart: number;
  colEnd: number;
  clippedStart?: boolean;
  clippedEnd?: boolean;
};

/**
 * Generate an array of date strings (YYYY-MM-DD) starting from startDate.
 */
export function generateDateRange(startDate: string, days: number): string[] {
  const start = parseISO(startDate);
  const result: string[] = [];
  for (let i = 0; i < days; i++) {
    result.push(format(addDays(start, i), "yyyy-MM-dd"));
  }
  return result;
}

/**
 * Get the 0-based column index for a date relative to the grid start date.
 * Returns a negative number for dates before the grid start.
 */
export function dateToColumnIndex(date: string, gridStartDate: string): number {
  return differenceInCalendarDays(parseISO(date), parseISO(gridStartDate));
}

/**
 * Convert booking check-in/check-out dates to CSS grid column positions.
 *
 * Column 1 is the bed label column, so date columns start at 2.
 * The grid covers [gridStartDate, gridEndDate] inclusive (gridEndDate is the
 * last visible date, so the grid end column = dayCount + 2 where
 * dayCount = differenceInCalendarDays(gridEndDate, gridStartDate) + 1).
 *
 * Uses half-open interval semantics: a booking occupies [checkIn, checkOut).
 *
 * Returns null if the booking is entirely outside the visible range.
 */
export function bookingToGridColumns(
  checkIn: string,
  checkOut: string,
  gridStartDate: string,
  gridEndDate: string
): GridColumns | null {
  // Number of visible days: gridStartDate through gridEndDate inclusive
  const dayCount =
    differenceInCalendarDays(parseISO(gridEndDate), parseISO(gridStartDate)) +
    1;

  // Grid occupies CSS columns 2 through (dayCount + 1).
  // The "end" column (exclusive) for the last visible day is dayCount + 2.
  const gridColStart = 2;
  const gridColEnd = dayCount + 2; // exclusive end for the full grid

  // Raw column positions (0-based index → +2 for CSS column offset)
  const rawCheckInIndex = dateToColumnIndex(checkIn, gridStartDate);
  const rawCheckOutIndex = dateToColumnIndex(checkOut, gridStartDate);

  const rawColStart = rawCheckInIndex + 2;
  const rawColEnd = rawCheckOutIndex + 2;

  // Booking is entirely before or entirely at/after the grid
  if (rawColEnd <= gridColStart || rawColStart >= gridColEnd) {
    return null;
  }

  const clippedStart = rawColStart < gridColStart;
  const clippedEnd = rawColEnd > gridColEnd;

  const colStart = clippedStart ? gridColStart : rawColStart;
  const colEnd = clippedEnd ? gridColEnd : rawColEnd;

  const result: GridColumns = { colStart, colEnd };
  if (clippedStart) result.clippedStart = true;
  if (clippedEnd) result.clippedEnd = true;

  return result;
}

/**
 * Check if two date ranges overlap using half-open interval semantics [start, end).
 */
export function datesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  const s1 = parseISO(start1);
  const e1 = parseISO(end1);
  const s2 = parseISO(start2);
  const e2 = parseISO(end2);

  // Ranges [s1, e1) and [s2, e2) overlap iff s1 < e2 && s2 < e1
  return s1 < e2 && s2 < e1;
}

/**
 * Return the number of visible days for a given breakpoint.
 */
export function getResponsiveDayCount(breakpoint: Breakpoint): number {
  switch (breakpoint) {
    case "mobile":
      return 7;
    case "tablet":
      return 14;
    case "desktop":
      return 30;
  }
}
