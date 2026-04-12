"use client";

import { useState } from "react";
import { addDays, format } from "date-fns";
import { cn } from "@/lib/utils";
import { BookingBar } from "./booking-bar";
import { DraggableBookingBar } from "./draggable-booking-bar";
import { DroppableCell } from "./droppable-cell";
import type { MatrixBed, MatrixHold } from "@/actions/bookings/matrix";
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
  /** Active bed holds — used to compute held / held-by-you cell status */
  holds?: MatrixHold[];
  currentMemberId?: string;
  selectedBookingIds?: Set<string>;
  onCellClick?: (bedId: string, date: string) => void;
  onBookingClick?: (bookingId: string, guestBedId: string) => void;
  abbreviateLabels?: boolean;
  /** When true, cells become droppable and booking bars become draggable */
  draggable?: boolean;
  /** Forwarded to DraggableBookingBar for resize handle callbacks */
  onResize?: (bookingId: string, newCheckIn: string, newCheckOut: string) => void;
  /** Width of a single date column in pixels — forwarded for resize delta calculation */
  cellWidth?: number;
  /**
   * Called when an admin drags across a range of available cells in this bed row.
   * startDate and endDate are both YYYY-MM-DD; endDate is already +1 day (half-open).
   */
  onRangeSelect?: (bedId: string, bedLabel: string, startDate: string, endDate: string) => void;
  /**
   * Called when the admin Ctrl+clicks (or Cmd+clicks) a booking bar to toggle selection.
   * @param bookingId - the booking's ID
   */
  onToggleSelect?: (bookingId: string) => void;
  /**
   * Wizard-specific: set of bedIds currently held-by-you (from booking context).
   * When provided, these cells render as "held-by-you" even before a DB refetch.
   */
  wizardHeldBedIds?: Set<string>;
  /** Wizard-specific: per-bed CSS color class for guest assignment overlay */
  wizardBedColorMap?: Map<string, string>;
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
  holds,
  currentMemberId,
  selectedBookingIds,
  onCellClick,
  onBookingClick,
  abbreviateLabels,
  draggable,
  onResize,
  cellWidth,
  onRangeSelect,
  onToggleSelect,
  wizardHeldBedIds,
  wizardBedColorMap,
}: Props) {
  // Drag-to-select state: the date where the drag started (if any)
  const [dragStartDate, setDragStartDate] = useState<string | null>(null);
  // The date the pointer is currently hovering over during a drag
  const [hoverDate, setHoverDate] = useState<string | null>(null);

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

  // Layer holds on top (held / held-by-you), but don't overwrite "booked"
  if (holds) {
    for (const hold of holds) {
      if (hold.bedId !== bed.id) continue;
      const holdStatus: CellStatus =
        currentMemberId && hold.memberId === currentMemberId
          ? "held-by-you"
          : "held";
      for (const date of visibleDates) {
        if (date >= hold.checkInDate && date < hold.checkOutDate) {
          const existing = dateStatusMap.get(date);
          if (!existing || existing === "available") {
            dateStatusMap.set(date, holdStatus);
          }
        }
      }
    }
  }

  // Wizard override: locally-tracked held-by-you beds (optimistic, before refetch)
  if (wizardHeldBedIds?.has(bed.id)) {
    for (const date of visibleDates) {
      const existing = dateStatusMap.get(date);
      if (!existing || existing === "available" || existing === "held") {
        dateStatusMap.set(date, "held-by-you");
      }
    }
  }

  // Compute the selection range bounds for visual highlight
  const selectionStart =
    dragStartDate && hoverDate
      ? dragStartDate < hoverDate
        ? dragStartDate
        : hoverDate
      : null;
  const selectionEnd =
    dragStartDate && hoverDate
      ? dragStartDate > hoverDate
        ? dragStartDate
        : hoverDate
      : null;

  function isInSelection(date: string): boolean {
    if (!selectionStart || !selectionEnd) return false;
    return date >= selectionStart && date <= selectionEnd;
  }

  function handleCellMouseDown(date: string, status: CellStatus) {
    if (!onRangeSelect) return;
    if (status !== "available") return;
    setDragStartDate(date);
    setHoverDate(date);
  }

  function handleCellMouseEnter(date: string) {
    if (!dragStartDate) return;
    setHoverDate(date);
  }

  function handleCellMouseUp(date: string, status: CellStatus) {
    if (!dragStartDate || !onRangeSelect) {
      setDragStartDate(null);
      setHoverDate(null);
      return;
    }

    if (status !== "available") {
      setDragStartDate(null);
      setHoverDate(null);
      return;
    }

    const start = dragStartDate < date ? dragStartDate : date;
    const endInclusive = dragStartDate > date ? dragStartDate : date;
    // endDate is exclusive (half-open): add 1 day
    const endDate = format(addDays(new Date(endInclusive), 1), "yyyy-MM-dd");

    setDragStartDate(null);
    setHoverDate(null);
    onRangeSelect(bed.id, bed.label, start, endDate);
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
        const inSelection = isInSelection(date);
        // Wizard guest-color overlay: when this bed is held-by-you, apply the
        // guest's color class instead of the default held-by-you color.
        const wizardColor =
          status === "held-by-you" && wizardBedColorMap
            ? wizardBedColorMap.get(bed.id)
            : undefined;
        const cellClassName = cn(
          "border-b border-r min-h-[36px] min-w-[40px] relative",
          inSelection
            ? "bg-blue-200 dark:bg-blue-800/40"
            : wizardColor ?? cellStatusClasses(status)
        );
        const cellStyle = { gridColumn: colIndex, gridRow };
        const handleClick = () => {
          if (status === "available" || status === "held-by-you") {
            onCellClick?.(bed.id, date);
          }
        };
        const cellAriaLabel = `${bed.label} on ${date} — ${status}`;

        const rangeHandlers = onRangeSelect
          ? {
              onMouseDown: () => handleCellMouseDown(date, status),
              onMouseEnter: () => handleCellMouseEnter(date),
              onMouseUp: () => handleCellMouseUp(date, status),
            }
          : {};

        if (draggable) {
          return (
            <DroppableCell
              key={date}
              bedId={bed.id}
              date={date}
              className={cellClassName}
              style={cellStyle}
              onClick={handleClick}
              aria-label={cellAriaLabel}
              {...rangeHandlers}
            />
          );
        }

        return (
          <div
            key={date}
            className={cellClassName}
            style={cellStyle}
            onClick={handleClick}
            aria-label={cellAriaLabel}
            {...rangeHandlers}
          />
        );
      })}

      {/* Booking bars positioned absolutely within the grid row */}
      {bookingBars
        .filter((bar) => bar.bedId === bed.id)
        .map((bar) =>
          draggable ? (
            <DraggableBookingBar
              key={bar.bookingGuestBedId}
              bar={bar}
              gridStartDate={gridStartDate}
              gridEndDate={gridEndDate}
              gridRow={gridRow}
              isSelected={selectedBookingIds?.has(bar.bookingId)}
              onClick={() =>
                onBookingClick?.(bar.bookingId, bar.bookingGuestBedId)
              }
              onToggleSelect={onToggleSelect}
              onResize={onResize}
              cellWidth={cellWidth}
            />
          ) : (
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
          )
        )}
    </>
  );
}
