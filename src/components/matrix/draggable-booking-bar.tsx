"use client";

import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { bookingToGridColumns } from "@/lib/matrix-utils";
import type { BedBookingBar } from "./booking-matrix";

type Props = {
  bar: BedBookingBar;
  gridStartDate: string;
  gridEndDate: string;
  /** CSS grid row number */
  gridRow: number;
  isSelected?: boolean;
  onClick?: () => void;
};

type BookingStatus = "CONFIRMED" | "PENDING" | "WAITLISTED" | "COMPLETED" | string;

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

/**
 * A draggable version of BookingBar. Supports vertical drag to move a
 * booking to a different bed. Desktop only — the DndContext using
 * PointerSensor handles ignoring touch events.
 */
export function DraggableBookingBar({
  bar,
  gridStartDate,
  gridEndDate,
  gridRow,
  isSelected,
  onClick,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: bar.bookingGuestBedId,
      data: { booking: bar },
    });

  const cols = bookingToGridColumns(
    bar.checkIn,
    bar.checkOut,
    gridStartDate,
    gridEndDate
  );

  if (!cols) return null;

  const { colStart, colEnd, clippedStart, clippedEnd } = cols;

  const transformStyle =
    transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined;

  return (
    <div
      ref={setNodeRef}
      aria-label={`${bar.guestName || "Guest"} — ${bar.bookingReference} (${bar.status})`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.();
      }}
      {...attributes}
      {...listeners}
      className={cn(
        "absolute inset-y-0.5 z-10 flex items-center px-1.5 text-xs font-medium rounded cursor-grab transition-opacity select-none min-h-[28px]",
        statusClasses(bar.status),
        isSelected && "ring-2 ring-offset-1 ring-ring",
        clippedStart && "rounded-l-none",
        clippedEnd && "rounded-r-none",
        isDragging && "opacity-50 cursor-grabbing"
      )}
      style={{
        gridColumn: `${colStart} / ${colEnd}`,
        gridRow,
        transform: transformStyle,
      }}
    >
      {clippedStart && (
        <span className="mr-1 opacity-60 shrink-0" aria-hidden>
          ◀
        </span>
      )}
      <span className="truncate">{bar.guestName || bar.bookingReference}</span>
      {clippedEnd && (
        <span className="ml-1 opacity-60 shrink-0" aria-hidden>
          ▶
        </span>
      )}
    </div>
  );
}
