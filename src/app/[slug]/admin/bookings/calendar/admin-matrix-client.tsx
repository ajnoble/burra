"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  BookingMatrix,
  DraggableMatrix,
  useMatrixState,
  useBreakpoint,
} from "@/components/matrix";
import { BookingDetailSheet } from "./booking-detail-sheet";
import { QuickCreateDialog } from "./quick-create-dialog";
import { getMatrixData, type MatrixData, type MatrixBooking } from "@/actions/bookings/matrix";
import { reassignBeds } from "@/actions/bookings/reassign-beds";
import { modifyBookingDates } from "@/actions/bookings/modify-dates";
import { Button } from "@/components/ui/button";

type Props = {
  lodgeId: string;
  lodgeName: string;
  organisationId: string;
  slug: string;
  seasonStartDate?: string;
  seasonEndDate?: string;
};

export function AdminMatrixClient({
  lodgeId,
  lodgeName,
  organisationId,
  slug,
  seasonStartDate,
  seasonEndDate,
}: Props) {
  const breakpoint = useBreakpoint();

  const state = useMatrixState({
    breakpoint,
    seasonStartDate,
    seasonEndDate,
  });

  const [data, setData] = useState<MatrixData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<MatrixBooking | null>(null);

  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateParams, setQuickCreateParams] = useState<{
    bedLabel: string;
    checkIn: string;
    checkOut: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const result = await getMatrixData(lodgeId, state.startDate, state.endDate);
      setData(result);
    } catch {
      setFetchError("Failed to load booking data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [lodgeId, state.startDate, state.endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleBookingClick(bookingId: string) {
    if (!data) return;
    const booking = data.bookings.find((b) => b.id === bookingId) ?? null;
    setSelectedBooking(booking);
    setSheetOpen(true);
  }

  function handleRangeSelect(
    _bedId: string,
    bedLabel: string,
    startDate: string,
    endDate: string
  ) {
    setQuickCreateParams({ bedLabel, checkIn: startDate, checkOut: endDate });
    setQuickCreateOpen(true);
  }

  async function handleMoveToBed(
    bookingGuestId: string,
    bookingId: string,
    newBedId: string
  ) {
    const result = await reassignBeds({
      bookingId,
      organisationId,
      assignments: [{ bookingGuestId, bedId: newBedId }],
      slug,
    });

    if (result.success) {
      toast.success("Bed reassigned successfully");
      await fetchData();
    } else {
      toast.error("Failed to reassign bed: " + (result.error ?? "Unknown error"));
    }
  }

  async function handleMoveDates(
    bookingId: string,
    newCheckIn: string,
    newCheckOut: string
  ) {
    const result = await modifyBookingDates({
      bookingId,
      organisationId,
      newCheckInDate: newCheckIn,
      newCheckOutDate: newCheckOut,
      slug,
    });

    if (result.success) {
      if (result.newTotalAmountCents !== undefined) {
        const formatted = `$${(result.newTotalAmountCents / 100).toFixed(2)}`;
        toast.success(`Dates moved — new total: ${formatted}`);
      } else {
        toast.success("Booking dates updated");
      }
      await fetchData();
    } else {
      toast.error("Failed to move dates: " + (result.error ?? "Unknown error"));
    }
  }

  async function handleResize(
    bookingId: string,
    newCheckIn: string,
    newCheckOut: string
  ) {
    const result = await modifyBookingDates({
      bookingId,
      organisationId,
      newCheckInDate: newCheckIn,
      newCheckOutDate: newCheckOut,
      slug,
    });

    if (result.success) {
      if (result.newTotalAmountCents !== undefined) {
        const formatted = `$${(result.newTotalAmountCents / 100).toFixed(2)}`;
        toast.success(`Booking resized — new total: ${formatted}`);
      } else {
        toast.success("Booking dates updated");
      }
      await fetchData();
    } else {
      toast.error("Failed to resize booking: " + (result.error ?? "Unknown error"));
    }
  }

  // Measure the matrix container to derive cell width for resize handles.
  // Cell width ≈ (container width - label column width) / number of visible dates.
  const matrixContainerRef = useRef<HTMLDivElement>(null);
  const [cellWidth, setCellWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!matrixContainerRef.current || !state.visibleDates.length) return;
    const containerWidth = matrixContainerRef.current.getBoundingClientRect().width;
    // Label column is minmax(80px, 120px) — use 100px as a mid-estimate
    const labelColumnWidth = 100;
    const dateColumnCount = state.visibleDates.length;
    const computed = (containerWidth - labelColumnWidth) / dateColumnCount;
    setCellWidth(computed > 0 ? computed : undefined);
  }, [state.visibleDates.length, data]);

  const isDesktop = breakpoint !== "mobile";

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{lodgeName}</h2>

      {fetchError && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{fetchError}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={fetchData}
            className="ml-auto"
          >
            Retry
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Loading bookings...
        </div>
      )}

      {data && !isLoading && (
        <div className="h-[600px]" ref={matrixContainerRef}>
          {isDesktop ? (
            <DraggableMatrix
              data={data}
              state={state}
              onBookingClick={handleBookingClick}
              abbreviateLabels={false}
              onMoveToBed={handleMoveToBed}
              onMoveDates={handleMoveDates}
              onResize={handleResize}
              cellWidth={cellWidth}
              onRangeSelect={handleRangeSelect}
              onToggleSelect={state.toggleBookingSelection}
            />
          ) : (
            <BookingMatrix
              data={data}
              state={state}
              onBookingClick={handleBookingClick}
              abbreviateLabels
              onRangeSelect={handleRangeSelect}
            />
          )}
        </div>
      )}

      {/* Status legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
          Confirmed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
          Pending
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-purple-500" />
          Waitlisted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-green-500" />
          Completed
        </span>
      </div>

      <BookingDetailSheet
        booking={selectedBooking}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        slug={slug}
      />

      {quickCreateParams && (
        <QuickCreateDialog
          open={quickCreateOpen}
          onClose={() => {
            setQuickCreateOpen(false);
            setQuickCreateParams(null);
          }}
          bedLabel={quickCreateParams.bedLabel}
          checkIn={quickCreateParams.checkIn}
          checkOut={quickCreateParams.checkOut}
          slug={slug}
        />
      )}
    </div>
  );
}
