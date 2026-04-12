"use client";

import { cn } from "@/lib/utils";
import { bookingToGridColumns } from "@/lib/matrix-utils";

type BookingStatus =
  | "CONFIRMED"
  | "PENDING"
  | "WAITLISTED"
  | "COMPLETED"
  | string;

type Props = {
  bookingId: string;
  guestName: string | null;
  checkIn: string;
  checkOut: string;
  status: BookingStatus;
  bookingReference: string;
  gridStartDate: string;
  gridEndDate: string;
  /** CSS grid row number */
  gridRow: number;
  isSelected?: boolean;
  onClick?: () => void;
};

function statusClasses(status: BookingStatus): string {
  switch (status) {
    case "CONFIRMED":
      return "bg-blue-500 text-white dark:bg-blue-600";
    case "PENDING":
      return "bg-amber-400 text-amber-950 dark:bg-amber-500";
    case "WAITLISTED":
      return "bg-purple-500 text-white dark:bg-purple-600";
    case "COMPLETED":
      return "bg-green-600 text-white dark:bg-green-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function BookingBar({
  checkIn,
  checkOut,
  status,
  guestName,
  bookingReference,
  gridStartDate,
  gridEndDate,
  gridRow,
  isSelected,
  onClick,
}: Props) {
  const cols = bookingToGridColumns(checkIn, checkOut, gridStartDate, gridEndDate);

  if (!cols) return null;

  const { colStart, colEnd, clippedStart, clippedEnd } = cols;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${guestName ?? "Guest"} — ${bookingReference} (${status})`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.();
      }}
      className={cn(
        "absolute inset-y-0.5 z-10 flex items-center px-1.5 text-xs font-medium rounded cursor-pointer transition-opacity select-none min-h-[28px]",
        statusClasses(status),
        isSelected && "ring-2 ring-offset-1 ring-ring",
        clippedStart && "rounded-l-none",
        clippedEnd && "rounded-r-none"
      )}
      style={{
        gridColumn: `${colStart} / ${colEnd}`,
        gridRow,
      }}
    >
      {/* Clip indicators */}
      {clippedStart && (
        <span className="mr-1 opacity-60 shrink-0" aria-hidden>
          ◀
        </span>
      )}
      <span className="truncate">{guestName ?? bookingReference}</span>
      {clippedEnd && (
        <span className="ml-1 opacity-60 shrink-0" aria-hidden>
          ▶
        </span>
      )}
    </div>
  );
}
