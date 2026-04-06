/**
 * Format a date string (YYYY-MM-DD) for display in emails.
 * Uses en-AU locale: "15 Jul 2027" or "15 July 2027" depending on system locale.
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
