"use client";

import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import type { MatrixState } from "./use-matrix-state";

type Props = {
  state: MatrixState;
};

export function DateNavigator({ state }: Props) {
  const { startDate, endDate, navigateBackward, navigateForward, jumpToToday } =
    state;

  const startLabel = format(parseISO(startDate), "d MMM yyyy");
  const endLabel = format(parseISO(endDate), "d MMM yyyy");

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

      <div className="flex items-center gap-1.5 ml-2 text-sm text-muted-foreground">
        <CalendarDays className="size-4 shrink-0" />
        <span>
          {startLabel} – {endLabel}
        </span>
      </div>
    </div>
  );
}
