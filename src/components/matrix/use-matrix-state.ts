"use client";

import { useState, useCallback } from "react";
import { format, addDays, parseISO } from "date-fns";
import {
  generateDateRange,
  getResponsiveDayCount,
  type Breakpoint,
} from "@/lib/matrix-utils";

export type ViewMode = "grid" | "list";

export type MatrixState = {
  startDate: string;
  visibleDates: string[];
  endDate: string;
  collapsedRooms: Set<string>;
  selectedBookingIds: Set<string>;
  viewMode: ViewMode;
  navigateForward: () => void;
  navigateBackward: () => void;
  jumpToDate: (date: string) => void;
  jumpToToday: () => void;
  toggleRoom: (roomId: string) => void;
  toggleBookingSelection: (bookingId: string) => void;
  clearSelection: () => void;
  setViewMode: (mode: ViewMode) => void;
};

type Options = {
  initialDate?: string;
  breakpoint: Breakpoint;
  seasonStartDate?: string;
  seasonEndDate?: string;
};

function clampDate(
  date: string,
  seasonStart?: string,
  seasonEnd?: string,
  dayCount?: number
): string {
  if (!seasonStart && !seasonEnd) return date;

  const parsed = parseISO(date);

  if (seasonStart && parsed < parseISO(seasonStart)) {
    return seasonStart;
  }

  if (seasonEnd && dayCount) {
    // Ensure the start date doesn't push the window past the season end
    const maxStart = format(
      addDays(parseISO(seasonEnd), -(dayCount - 1)),
      "yyyy-MM-dd"
    );
    if (date > maxStart) {
      return maxStart > (seasonStart ?? "") ? maxStart : seasonStart ?? date;
    }
  }

  return date;
}

export function useMatrixState({
  initialDate,
  breakpoint,
  seasonStartDate,
  seasonEndDate,
}: Options): MatrixState {
  const today = format(new Date(), "yyyy-MM-dd");
  const dayCount = getResponsiveDayCount(breakpoint);

  const [startDate, setStartDate] = useState<string>(() => {
    const base = initialDate ?? today;
    return clampDate(base, seasonStartDate, seasonEndDate, dayCount);
  });

  const [collapsedRooms, setCollapsedRooms] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<string>>(
    () => new Set()
  );
  const [viewMode, setViewModeState] = useState<ViewMode>("grid");

  const visibleDates = generateDateRange(startDate, dayCount);
  const endDate = visibleDates[visibleDates.length - 1] ?? startDate;

  const navigateForward = useCallback(() => {
    const next = format(
      addDays(parseISO(startDate), dayCount),
      "yyyy-MM-dd"
    );
    setStartDate(clampDate(next, seasonStartDate, seasonEndDate, dayCount));
  }, [startDate, dayCount, seasonStartDate, seasonEndDate]);

  const navigateBackward = useCallback(() => {
    const prev = format(
      addDays(parseISO(startDate), -dayCount),
      "yyyy-MM-dd"
    );
    setStartDate(clampDate(prev, seasonStartDate, seasonEndDate, dayCount));
  }, [startDate, dayCount, seasonStartDate, seasonEndDate]);

  const jumpToDate = useCallback(
    (date: string) => {
      setStartDate(clampDate(date, seasonStartDate, seasonEndDate, dayCount));
    },
    [dayCount, seasonStartDate, seasonEndDate]
  );

  const jumpToToday = useCallback(() => {
    setStartDate(clampDate(today, seasonStartDate, seasonEndDate, dayCount));
  }, [today, dayCount, seasonStartDate, seasonEndDate]);

  const toggleRoom = useCallback((roomId: string) => {
    setCollapsedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  }, []);

  const toggleBookingSelection = useCallback((bookingId: string) => {
    setSelectedBookingIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookingId)) {
        next.delete(bookingId);
      } else {
        next.add(bookingId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedBookingIds(new Set());
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
  }, []);

  return {
    startDate,
    visibleDates,
    endDate,
    collapsedRooms,
    selectedBookingIds,
    viewMode,
    navigateForward,
    navigateBackward,
    jumpToDate,
    jumpToToday,
    toggleRoom,
    toggleBookingSelection,
    clearSelection,
    setViewMode,
  };
}
