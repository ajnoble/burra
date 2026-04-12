"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BedRow } from "./bed-row";
import type { MatrixRoom, MatrixHold } from "@/actions/bookings/matrix";
import type { BedBookingBar } from "./booking-matrix";

type Props = {
  room: MatrixRoom;
  visibleDates: string[];
  gridStartDate: string;
  gridEndDate: string;
  /** The CSS grid row at which this room group starts */
  startGridRow: number;
  isCollapsed: boolean;
  onToggle: () => void;
  bookingBars: BedBookingBar[];
  /** Active bed holds — forwarded to BedRow for cell status computation */
  holds?: MatrixHold[];
  currentMemberId?: string;
  selectedBookingIds?: Set<string>;
  onCellClick?: (bedId: string, date: string, bedLabel: string) => void;
  onBookingClick?: (bookingId: string, guestBedId: string) => void;
  abbreviateLabels?: boolean;
  /** Total number of grid columns (date columns + 1 for the label column) */
  totalColumns: number;
  /** When true, cells become droppable and booking bars become draggable */
  draggable?: boolean;
  /** Forwarded to BedRow → DraggableBookingBar for resize handle callbacks */
  onResize?: (bookingId: string, newCheckIn: string, newCheckOut: string) => void;
  /** Width of a single date column in pixels — forwarded for resize delta calculation */
  cellWidth?: number;
  /** Called when admin drags across available cells to create a booking range */
  onRangeSelect?: (bedId: string, bedLabel: string, startDate: string, endDate: string) => void;
  /**
   * Called when the admin Ctrl+clicks (or Cmd+clicks) a booking bar to toggle selection.
   * @param bookingId - the booking's ID
   */
  onToggleSelect?: (bookingId: string) => void;
  /** Wizard-specific: set of bedIds held-by-you in the booking context */
  wizardHeldBedIds?: Set<string>;
  /** Wizard-specific: per-bed CSS color class for guest assignment overlay */
  wizardBedColorMap?: Map<string, string>;
};

export function RoomGroup({
  room,
  visibleDates,
  gridStartDate,
  gridEndDate,
  startGridRow,
  isCollapsed,
  onToggle,
  bookingBars,
  holds,
  currentMemberId,
  selectedBookingIds,
  onCellClick,
  onBookingClick,
  abbreviateLabels,
  totalColumns,
  draggable,
  onResize,
  cellWidth,
  onRangeSelect,
  onToggleSelect,
  wizardHeldBedIds,
  wizardBedColorMap,
}: Props) {
  // Count active bookings for the occupancy indicator
  const occupiedBedIds = new Set(
    bookingBars.map((b) => b.bedId)
  );
  const occupancyCount = occupiedBedIds.size;

  return (
    <>
      {/* Room header row — spans all columns */}
      <div
        className={cn(
          "sticky left-0 z-20 flex items-center gap-2 px-3 py-1.5 min-h-[36px]",
          "bg-muted/70 dark:bg-muted/40 border-b border-r",
          "cursor-pointer hover:bg-muted transition-colors"
        )}
        style={{ gridColumn: `1 / span ${totalColumns}`, gridRow: startGridRow }}
        onClick={onToggle}
        role="button"
        aria-expanded={!isCollapsed}
        aria-label={`Toggle ${room.name}`}
      >
        {isCollapsed ? (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold truncate">{room.name}</span>
        {room.floor && (
          <span className="text-xs text-muted-foreground">({room.floor})</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {occupancyCount}/{room.capacity}
        </span>
      </div>

      {/* Bed rows — hidden when collapsed */}
      {!isCollapsed &&
        room.beds.map((bed, idx) => (
          <BedRow
            key={bed.id}
            bed={bed}
            visibleDates={visibleDates}
            gridStartDate={gridStartDate}
            gridEndDate={gridEndDate}
            gridRow={startGridRow + 1 + idx}
            bookingBars={bookingBars}
            holds={holds}
            currentMemberId={currentMemberId}
            selectedBookingIds={selectedBookingIds}
            onCellClick={onCellClick}
            onBookingClick={onBookingClick}
            abbreviateLabels={abbreviateLabels}
            draggable={draggable}
            onResize={onResize}
            cellWidth={cellWidth}
            onRangeSelect={onRangeSelect}
            onToggleSelect={onToggleSelect}
            wizardHeldBedIds={wizardHeldBedIds}
            wizardBedColorMap={wizardBedColorMap}
          />
        ))}
    </>
  );
}
