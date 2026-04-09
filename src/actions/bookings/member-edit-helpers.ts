import { formatCurrency } from "@/lib/currency";

/**
 * Check if a booking is within the edit window.
 * Returns true if check-in is far enough in the future (>= windowDays AND > 0 days away).
 */
export function isWithinEditWindow(
  checkInDate: string,
  windowDays: number
): boolean {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const checkIn = new Date(checkInDate + "T00:00:00Z");
  const diffMs = checkIn.getTime() - today.getTime();
  const daysUntil = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  // Must be in the future AND have enough days remaining
  return daysUntil > 0 && daysUntil >= windowDays;
}

type ChangesInput = {
  oldCheckIn?: string;
  oldCheckOut?: string;
  newCheckIn?: string;
  newCheckOut?: string;
  addedGuestNames?: string[];
  removedGuestNames?: string[];
  oldTotalCents?: number;
  newTotalCents?: number;
};

/**
 * Build a human-readable description of booking changes for emails.
 */
export function buildChangesDescription(input: ChangesInput): string {
  const parts: string[] = [];

  if (input.oldCheckIn && input.newCheckIn && input.oldCheckOut && input.newCheckOut) {
    if (input.oldCheckIn !== input.newCheckIn || input.oldCheckOut !== input.newCheckOut) {
      parts.push(
        `Dates: ${input.oldCheckIn} – ${input.oldCheckOut} → ${input.newCheckIn} – ${input.newCheckOut}`
      );
    }
  }

  if (input.addedGuestNames && input.addedGuestNames.length > 0) {
    parts.push(`Guests — Added: ${input.addedGuestNames.join(", ")}`);
  }

  if (input.removedGuestNames && input.removedGuestNames.length > 0) {
    parts.push(`Guests — Removed: ${input.removedGuestNames.join(", ")}`);
  }

  if (
    input.oldTotalCents !== undefined &&
    input.newTotalCents !== undefined &&
    input.oldTotalCents !== input.newTotalCents
  ) {
    parts.push(
      `Price: ${formatCurrency(input.oldTotalCents)} → ${formatCurrency(input.newTotalCents)}`
    );
  }

  return parts.join("; ");
}
