import { format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const DEFAULT_TIMEZONE = "Australia/Melbourne";

/**
 * Convert a UTC date to the organisation's timezone for display.
 */
export function toOrgTime(
  date: Date | string,
  timezone: string = DEFAULT_TIMEZONE
): Date {
  return toZonedTime(new Date(date), timezone);
}

/**
 * Convert a local date (in org timezone) to UTC for storage.
 */
export function toUTC(
  date: Date | string,
  timezone: string = DEFAULT_TIMEZONE
): Date {
  return fromZonedTime(new Date(date), timezone);
}

/**
 * Format a UTC date for display in the organisation's timezone.
 */
export function formatOrgDate(
  date: Date | string,
  formatStr: string = "d MMM yyyy",
  timezone: string = DEFAULT_TIMEZONE
): string {
  return format(toOrgTime(date, timezone), formatStr);
}

/**
 * Format a UTC datetime for display in the organisation's timezone.
 */
export function formatOrgDateTime(
  date: Date | string,
  formatStr: string = "d MMM yyyy, h:mm a",
  timezone: string = DEFAULT_TIMEZONE
): string {
  return format(toOrgTime(date, timezone), formatStr);
}

/**
 * Check if a date falls on a weekend (Saturday or Sunday)
 * in the organisation's timezone.
 */
export function isWeekend(
  date: Date | string,
  timezone: string = DEFAULT_TIMEZONE
): boolean {
  const orgDate = toOrgTime(date, timezone);
  const day = orgDate.getDay();
  return day === 0 || day === 6;
}
