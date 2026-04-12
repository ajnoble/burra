"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BookingMatrix, useMatrixState, useBreakpoint } from "@/components/matrix";
import { AvailabilityList } from "./availability-list";
import { getMatrixData, type MatrixData } from "@/actions/bookings/matrix";
import { Button } from "@/components/ui/button";
import { BookingPopover, type BookingPopoverSelection } from "./booking-popover";
import { BookingSheet } from "./booking-sheet";

type OpenRoundSummary = {
  id: string;
  name: string;
};

type CellSelection = {
  bedId: string;
  bedLabel: string;
  date: string;
};

type Props = {
  lodgeId: string;
  lodgeName: string;
  slug: string;
  seasonStartDate?: string;
  seasonEndDate?: string;
  openRounds?: OpenRoundSummary[];
  memberId?: string;
};

export function AvailabilityMatrixClient({
  lodgeId,
  lodgeName,
  slug,
  seasonStartDate,
  seasonEndDate,
  openRounds = [],
  memberId,
}: Props) {
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === "mobile";

  const state = useMatrixState({
    breakpoint,
    seasonStartDate,
    seasonEndDate,
  });

  // On mobile, default to list view; on tablet/desktop show grid
  const [showList, setShowList] = useState(isMobile);

  // Sync showList when breakpoint changes: if moving to non-mobile, switch to grid
  useEffect(() => {
    if (!isMobile) {
      setShowList(false);
    }
  }, [isMobile]);

  const [data, setData] = useState<MatrixData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const result = await getMatrixData(lodgeId, state.startDate, state.endDate);
      setData(result);
    } catch {
      setFetchError("Failed to load availability data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [lodgeId, state.startDate, state.endDate]);

  // Fetch on mount and whenever the visible window changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Popover state ---
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [cellSelection, setCellSelection] = useState<CellSelection | null>(null);
  const popoverAnchorRef = useRef<HTMLElement | null>(null);

  // --- Sheet state ---
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSelection, setSheetSelection] = useState<BookingPopoverSelection | null>(null);

  function handleCellClick(bedId: string, date: string, bedLabel: string) {
    const target = document.activeElement as HTMLElement;
    popoverAnchorRef.current = target;
    setCellSelection({ bedId, bedLabel, date });
    setPopoverOpen(true);
  }

  function handleStartBooking(selection: BookingPopoverSelection) {
    setPopoverOpen(false);
    setSheetSelection(selection);
    setSheetOpen(true);
  }

  function handleBookingComplete() {
    setSheetOpen(false);
    setSheetSelection(null);
    fetchData();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{lodgeName}</h2>

        {/* Toggle only shown on mobile */}
        {isMobile && (
          <div className="flex items-center border rounded-md overflow-hidden text-sm">
            <button
              type="button"
              className={`px-3 py-1.5 transition-colors ${
                showList
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => setShowList(true)}
              aria-pressed={showList}
            >
              List
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 transition-colors ${
                !showList
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => setShowList(false)}
              aria-pressed={!showList}
            >
              Grid
            </button>
          </div>
        )}
      </div>

      {/* Mobile list view */}
      {showList && isMobile && (
        <AvailabilityList
          lodgeId={lodgeId}
          slug={slug}
          seasonStartDate={seasonStartDate}
          seasonEndDate={seasonEndDate}
        />
      )}

      {/* Matrix grid view (tablet/desktop or toggled on mobile) */}
      {!showList && (
        <div className="space-y-4">
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
              Loading availability...
            </div>
          )}

          {data && !isLoading && (
            <div className="h-[500px]">
              <BookingMatrix
                data={data}
                state={state}
                onCellClick={handleCellClick}
                abbreviateLabels={breakpoint !== "desktop"}
                seasonStartDate={seasonStartDate}
                seasonEndDate={seasonEndDate}
              />
            </div>
          )}

          {/* Color legend */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-green-500" />
              Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
              Booked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
              Held
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-gray-400" />
              Closed
            </span>
          </div>
        </div>
      )}

      {/* Booking popover — shown when a cell is clicked */}
      {cellSelection && (
        <BookingPopover
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          anchorRef={popoverAnchorRef}
          date={cellSelection.date}
          bedId={cellSelection.bedId}
          bedLabel={cellSelection.bedLabel}
          lodgeName={lodgeName}
          openRounds={openRounds}
          onStartBooking={handleStartBooking}
        />
      )}

      {/* Booking sheet drawer */}
      <BookingSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        selection={sheetSelection}
        slug={slug}
        onBookingComplete={handleBookingComplete}
      />
    </div>
  );
}
