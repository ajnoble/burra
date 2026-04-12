"use client";

import { useDraggable } from "@dnd-kit/core";
import { addDays, format } from "date-fns";
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
  /**
   * Called when the user Ctrl+clicks (or Cmd+clicks) the bar to toggle selection.
   * @param bookingId - the booking's ID
   */
  onToggleSelect?: (bookingId: string) => void;
  /**
   * Called when a resize handle drag completes.
   * @param bookingId - the booking's ID
   * @param newCheckIn - new check-in date (YYYY-MM-DD)
   * @param newCheckOut - new check-out date (YYYY-MM-DD)
   */
  onResize?: (bookingId: string, newCheckIn: string, newCheckOut: string) => void;
  /** Width of a single date column in pixels — used by resize handles to convert pixel delta to days */
  cellWidth?: number;
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

/** Minimum booking duration in nights */
const MIN_NIGHTS = 1;

type ResizeHandleProps = {
  side: "left" | "right";
  /** Width of a single date column in pixels — used to convert pixel delta to days */
  cellWidth: number;
  onResize: (daysDelta: number) => void;
};

/** Fallback cell width when none is measured */
const DEFAULT_CELL_WIDTH_PX = 40;

/**
 * A resize handle rendered at the left or right edge of a booking bar.
 * Uses raw pointer events rather than dnd-kit because dnd-kit's drag model
 * doesn't map well to edge-based resizing.
 */
function ResizeHandle({ side, cellWidth, onResize }: ResizeHandleProps) {
  function handlePointerDown(e: React.PointerEvent) {
    // Prevent the bar's dnd-kit drag from starting
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    // Capture the pointer so we receive move/up events outside the element
    (e.target as Element).setPointerCapture(e.pointerId);

    function handlePointerUp(ev: PointerEvent) {
      const deltaX = ev.clientX - startX;
      const daysDelta = Math.round(deltaX / cellWidth);
      if (daysDelta !== 0) onResize(daysDelta);
      document.removeEventListener("pointerup", handlePointerUp);
    }

    document.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <div
      aria-hidden
      className={cn(
        "absolute top-0 bottom-0 w-2 z-10 cursor-col-resize opacity-0 hover:opacity-100 hover:bg-white/30 rounded transition-opacity",
        side === "left" ? "left-0" : "right-0"
      )}
      onPointerDown={handlePointerDown}
    />
  );
}

/**
 * A draggable version of BookingBar. Supports:
 * - Vertical drag to move a booking to a different bed.
 * - Horizontal drag to shift dates (same bed) — handled by DraggableMatrix.
 * - Left/right edge resize handles to change check-in or check-out dates.
 *
 * Desktop only — the DndContext using PointerSensor handles ignoring touch
 * events. Resize handles use raw pointer events.
 */
export function DraggableBookingBar({
  bar,
  gridStartDate,
  gridEndDate,
  gridRow,
  isSelected,
  onClick,
  onToggleSelect,
  onResize,
  cellWidth,
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

  function handleLeftResize(daysDelta: number) {
    if (!onResize) return;
    const originalCheckIn = new Date(bar.checkIn);
    const originalCheckOut = new Date(bar.checkOut);
    const newCheckIn = addDays(originalCheckIn, daysDelta);
    // Enforce minimum 1 night
    const maxCheckIn = addDays(originalCheckOut, -(MIN_NIGHTS));
    const clampedCheckIn = newCheckIn > maxCheckIn ? maxCheckIn : newCheckIn;
    onResize(
      bar.bookingId,
      format(clampedCheckIn, "yyyy-MM-dd"),
      bar.checkOut
    );
  }

  function handleRightResize(daysDelta: number) {
    if (!onResize) return;
    const originalCheckOut = new Date(bar.checkOut);
    const originalCheckIn = new Date(bar.checkIn);
    const newCheckOut = addDays(originalCheckOut, daysDelta);
    // Enforce minimum 1 night
    const minCheckOut = addDays(originalCheckIn, MIN_NIGHTS);
    const clampedCheckOut = newCheckOut < minCheckOut ? minCheckOut : newCheckOut;
    onResize(
      bar.bookingId,
      bar.checkIn,
      format(clampedCheckOut, "yyyy-MM-dd")
    );
  }

  const effectiveCellWidth = cellWidth ?? DEFAULT_CELL_WIDTH_PX;

  function handleClick(e: React.MouseEvent) {
    if ((e.ctrlKey || e.metaKey) && onToggleSelect) {
      e.preventDefault();
      onToggleSelect(bar.bookingId);
    } else {
      onClick?.();
    }
  }

  return (
    <div
      ref={setNodeRef}
      aria-label={`${bar.guestName || "Guest"} — ${bar.bookingReference} (${bar.status})`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.();
      }}
      {...attributes}
      {...listeners}
      className={cn(
        "absolute inset-y-0.5 z-10 flex items-center px-1.5 text-xs font-medium rounded cursor-grab transition-opacity select-none min-h-[28px]",
        statusClasses(bar.status),
        isSelected && "ring-2 ring-primary ring-offset-1",
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
      {/* Left resize handle — only shown when not clipped on the left */}
      {onResize && !clippedStart && (
        <ResizeHandle side="left" cellWidth={effectiveCellWidth} onResize={handleLeftResize} />
      )}

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

      {/* Right resize handle — only shown when not clipped on the right */}
      {onResize && !clippedEnd && (
        <ResizeHandle side="right" cellWidth={effectiveCellWidth} onResize={handleRightResize} />
      )}
    </div>
  );
}
