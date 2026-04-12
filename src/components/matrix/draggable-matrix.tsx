"use client";

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { BookingMatrix } from "./booking-matrix";
import type { MatrixData } from "@/actions/bookings/matrix";
import type { MatrixState } from "./use-matrix-state";
import type { BedBookingBar } from "./booking-matrix";

type Props = {
  data: MatrixData;
  state: MatrixState;
  currentMemberId?: string;
  onCellClick?: (bedId: string, date: string) => void;
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
};

/**
 * Wraps BookingMatrix in a DndContext enabling drag-and-drop bed reassignment.
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

    // Only act if the target bed differs from the current bed
    if (target.bedId !== bar.bedId) {
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
      />
    </DndContext>
  );
}
