"use client";

import { cn } from "@/lib/utils";
import { BookingBar } from "./booking-bar";
import type { MatrixBed } from "@/actions/bookings/matrix";
import type { BedBookingBar } from "./booking-matrix";

type CellStatus = "available" | "booked" | "held" | "held-by-you" | "closed";

type Props = {
  bed: MatrixBed;
  visibleDates: string[];
  gridStartDate: string;
  gridEndDate: string;
  /** CSS grid row index for this bed row */
  gridRow: number;
  bookingBars: BedBookingBar[];
  currentMemberId?: string;
  selectedBookingIds?: Set<string>;
  onCellClick?: (bedId: string, date: string) => void;
  onBookingClick?: (bookingId: string, guestBedId: string) => void;
  abbreviateLabels?: boolean;
};

function cellStatusClasses(status: CellStatus): string {
  switch (status) {
    case "available":
      return "bg-green-50 hover:bg-green-100 dark:bg-green-950/20 dark:hover:bg-green-950/30 cursor-pointer";
    case "booked":
      return "bg-red-100 dark:bg-red-950/30";
    case "held":
      return "bg-amber-100 dark:bg-amber-950/30";
    case "held-by-you":
      return "bg-blue-100 dark:bg-blue-950/30";
    case "closed":
      return "bg-zinc-200 dark:bg-zinc-800";
  }
}

export function BedRow({
  bed,
  visibleDates,
  gridStartDate,
  gridEndDate,
  gridRow,
  bookingBars,
  currentMemberId,
  selectedBookingIds,
  onCellClick,
  onBookingClick,
  abbreviateLabels,
}: Props) {
  // Build a quick lookup: date → status for this bed
  const dateStatusMap = new Map<string, CellStatus>();

  for (const bar of bookingBars) {
    if (bar.bedId !== bed.id) continue;
    for (const date of visibleDates) {
      // Booking occupies [checkIn, checkOut) half-open interval
      if (date >= bar.checkIn && date < bar.checkOut) {
        dateStatusMap.set(date, "booked");
      }
    }
  }

  return (
    <>
      {/* Bed label — sticky left */}
      <div
        className="sticky left-0 z-10 bg-background border-b border-r flex items-center px-2 min-h-[36px] text-xs text-muted-foreground font-medium"
        style={{ gridColumn: 1, gridRow }}
      >
        <span className="truncate">
          {abbreviateLabels ? bed.label.slice(0, 3) : bed.label}
        </span>
      </div>

      {/* Date cells */}
      {visibleDates.map((date, i) => {
        const status = dateStatusMap.get(date) ?? "available";
        const colIndex = i + 2;

        return (
          <div
            key={date}
            className={cn(
              "border-b border-r min-h-[36px] min-w-[40px] relative",
              cellStatusClasses(status)
            )}
            style={{ gridColumn: colIndex, gridRow }}
            onClick={() => {
              if (status === "available") {
                onCellClick?.(bed.id, date);
              }
            }}
            aria-label={`${bed.label} on ${date} — ${status}`}
          />
        );
      })}

      {/* Booking bars positioned absolutely within the grid row */}
      {bookingBars
        .filter((bar) => bar.bedId === bed.id)
        .map((bar) => (
          <BookingBar
            key={bar.bookingGuestBedId}
            bookingId={bar.bookingId}
            guestName={bar.guestName || null}
            checkIn={bar.checkIn}
            checkOut={bar.checkOut}
            status={bar.status}
            bookingReference={bar.bookingReference}
            gridStartDate={gridStartDate}
            gridEndDate={gridEndDate}
            gridRow={gridRow}
            isSelected={selectedBookingIds?.has(bar.bookingId)}
            onClick={() =>
              onBookingClick?.(bar.bookingId, bar.bookingGuestBedId)
            }
          />
        ))}
    </>
  );
}
