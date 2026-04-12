"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePickerPopover } from "./date-picker-popover";
import type { MatrixState } from "./use-matrix-state";

type Props = {
  state: MatrixState;
  seasonStartDate?: string;
  seasonEndDate?: string;
};

export function DateNavigator({ state, seasonStartDate, seasonEndDate }: Props) {
  const { startDate, endDate, navigateBackward, navigateForward, jumpToToday, jumpToDate } = state;

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-background">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={navigateBackward}
        aria-label="Previous period"
      >
        <ChevronLeft />
      </Button>

      <Button
        variant="outline"
        size="icon-sm"
        onClick={navigateForward}
        aria-label="Next period"
      >
        <ChevronRight />
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={jumpToToday}
        aria-label="Jump to today"
      >
        Today
      </Button>

      <DatePickerPopover
        startDate={startDate}
        endDate={endDate}
        onDateSelect={jumpToDate}
        seasonStartDate={seasonStartDate}
        seasonEndDate={seasonEndDate}
      />
    </div>
  );
}
