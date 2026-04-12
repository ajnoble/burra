"use client";

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { BookingMatrix } from "./booking-matrix";
import type { MatrixData } from "@/actions/bookings/matrix";
import type { MatrixState } from "./use-matrix-state";
import type { BedBookingBar } from "./booking-matrix";

type Props = {
  data: MatrixData;
  state: MatrixState;
  currentMemberId?: string;
  onCellClick?: (bedId: string, date: string, bedLabel: string) => void;
  onBookingClick?: (bookingId: string, guestBedId: string) => void;
  abbreviateLabels?: boolean;
  /**
   * Called when a booking bar is dropped onto a different bed.
   * @param bookingGuestId - the bookingGuests.id to reassign
   * @param bookingId - the booking's ID
   * @param newBedId - the target bed ID
   */
  onMoveToBed: (
    bookingGuestId: string,
    bookingId: string,
    newBedId: string
  ) => void;
  /**
   * Called when a booking bar is dragged horizontally to new dates (same bed).
   * @param bookingId - the booking's ID
   * @param newCheckIn - new check-in date (YYYY-MM-DD)
   * @param newCheckOut - new check-out date (YYYY-MM-DD)
   */
  onMoveDates?: (
    bookingId: string,
    newCheckIn: string,
    newCheckOut: string
  ) => void;
  /**
   * Called when a resize handle drag completes.
   * @param bookingId - the booking's ID
   * @param newCheckIn - new check-in date (YYYY-MM-DD)
   * @param newCheckOut - new check-out date (YYYY-MM-DD)
   */
  onResize?: (
    bookingId: string,
    newCheckIn: string,
    newCheckOut: string
  ) => void;
  /**
   * Width of a single date column in pixels, forwarded to booking bars for
   * resize-handle day delta calculation. When omitted bars use a built-in default.
   */
  cellWidth?: number;
  /** Called when admin drags across available cells to select a booking range */
  onRangeSelect?: (bedId: string, bedLabel: string, startDate: string, endDate: string) => void;
  /**
   * Called when the admin Ctrl+clicks (or Cmd+clicks) a booking bar to toggle selection.
   * @param bookingId - the booking's ID
   */
  onToggleSelect?: (bookingId: string) => void;
};

/**
 * Wraps BookingMatrix in a DndContext enabling drag-and-drop interactions:
 * - Vertical drag: reassign booking to a different bed (onMoveToBed)
 * - Horizontal drag (same bed): shift booking dates (onMoveDates)
 *
 * Uses PointerSensor with an 8px activation distance to avoid accidental drags.
 */
export function DraggableMatrix({
  data,
  state,
  currentMemberId,
  onCellClick,
  onBookingClick,
  abbreviateLabels,
  onMoveToBed,
  onMoveDates,
  onResize,
  cellWidth,
  onRangeSelect,
  onToggleSelect,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over) return;

    const bar = active.data.current?.booking as BedBookingBar | undefined;
    const target = over.data.current as { bedId: string; date: string } | undefined;

    if (!bar || !target) return;

    if (target.bedId === bar.bedId) {
      // Same bed — treat as a date-shift if the drop date differs from check-in
      if (onMoveDates && target.date !== bar.checkIn) {
        const offset = differenceInCalendarDays(
          new Date(target.date),
          new Date(bar.checkIn)
        );
        const newCheckIn = format(
          addDays(new Date(bar.checkIn), offset),
          "yyyy-MM-dd"
        );
        const newCheckOut = format(
          addDays(new Date(bar.checkOut), offset),
          "yyyy-MM-dd"
        );
        onMoveDates(bar.bookingId, newCheckIn, newCheckOut);
      }
    } else {
      // Different bed — reassign
      onMoveToBed(bar.bookingGuestId, bar.bookingId, target.bedId);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <BookingMatrix
        data={data}
        state={state}
        currentMemberId={currentMemberId}
        onCellClick={onCellClick}
        onBookingClick={onBookingClick}
        abbreviateLabels={abbreviateLabels}
        draggable
        onResize={onResize}
        cellWidth={cellWidth}
        onRangeSelect={onRangeSelect}
        onToggleSelect={onToggleSelect}
      />
    </DndContext>
  );
}
