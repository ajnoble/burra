"use client";

import { useMemo } from "react";
import { DateNavigator } from "./date-navigator";
import { MatrixHeader } from "./matrix-header";
import { RoomGroup } from "./room-group";
import type { MatrixData } from "@/actions/bookings/matrix";
import type { MatrixState } from "./use-matrix-state";

// ---------------------------------------------------------------------------
// Per-bed booking bar shape — flattened from MatrixBooking.guests
// ---------------------------------------------------------------------------

export type BedBookingBar = {
  /** bookingGuest.id — unique per guest-bed assignment */
  bookingGuestBedId: string;
  /** The bookingGuests.id — used for reassignment */
  bookingGuestId: string;
  bookingId: string;
  guestName: string;
  bedId: string;
  checkIn: string;
  checkOut: string;
  status: string;
  bookingReference: string;
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  data: MatrixData;
  state: MatrixState;
  currentMemberId?: string;
  onCellClick?: (bedId: string, date: string) => void;
  onBookingClick?: (bookingId: string, guestBedId: string) => void;
  draggable?: boolean;
  abbreviateLabels?: boolean;
};

// ---------------------------------------------------------------------------
// Flatten helper
// ---------------------------------------------------------------------------

function flattenBookings(data: MatrixData): BedBookingBar[] {
  const bars: BedBookingBar[] = [];

  for (const booking of data.bookings) {
    for (const guest of booking.guests) {
      if (!guest.bedId) continue;

      const guestName = [guest.firstName, guest.lastName]
        .filter(Boolean)
        .join(" ");

      bars.push({
        bookingGuestBedId: guest.id,
        bookingGuestId: guest.id,
        bookingId: booking.id,
        guestName,
        bedId: guest.bedId,
        checkIn: booking.checkInDate,
        checkOut: booking.checkOutDate,
        status: booking.status,
        bookingReference: booking.bookingReference,
      });
    }
  }

  return bars;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookingMatrix({
  data,
  state,
  currentMemberId,
  onCellClick,
  onBookingClick,
  draggable,
  abbreviateLabels,
}: Props) {
  const { visibleDates, startDate, endDate, collapsedRooms, selectedBookingIds, toggleRoom } =
    state;

  const bedBars = useMemo(() => flattenBookings(data), [data]);

  // Total grid columns: 1 label column + N date columns
  const totalColumns = visibleDates.length + 1;

  // Build CSS grid-template-columns: fixed label width + equal date columns
  const gridTemplateColumns = `minmax(80px, 120px) repeat(${visibleDates.length}, minmax(36px, 1fr))`;

  // Compute starting grid row for each room group
  // Row 1 = header, then each room occupies 1 room-header row + N bed rows
  let currentRow = 2; // row 1 is the date header
  const roomRows: { room: (typeof data.rooms)[number]; startRow: number }[] =
    [];

  for (const room of data.rooms) {
    roomRows.push({ room, startRow: currentRow });
    currentRow += 1; // room header
    if (!collapsedRooms.has(room.id)) {
      currentRow += room.beds.length;
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden border rounded-lg bg-background">
      {/* Navigation bar */}
      <DateNavigator state={state} />

      {/* Scrollable matrix grid */}
      <div className="overflow-auto flex-1">
        <div
          className="relative grid"
          style={{
            gridTemplateColumns,
            gridTemplateRows: `36px`,
          }}
        >
          {/* Sticky date header row */}
          <MatrixHeader visibleDates={visibleDates} />

          {/* Room groups */}
          {roomRows.map(({ room, startRow }) => (
            <RoomGroup
              key={room.id}
              room={room}
              visibleDates={visibleDates}
              gridStartDate={startDate}
              gridEndDate={endDate}
              startGridRow={startRow}
              isCollapsed={collapsedRooms.has(room.id)}
              onToggle={() => toggleRoom(room.id)}
              bookingBars={bedBars.filter((b) =>
                room.beds.some((bed) => bed.id === b.bedId)
              )}
              currentMemberId={currentMemberId}
              selectedBookingIds={selectedBookingIds}
              onCellClick={onCellClick}
              onBookingClick={onBookingClick}
              abbreviateLabels={abbreviateLabels}
              totalColumns={totalColumns}
              draggable={draggable}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
