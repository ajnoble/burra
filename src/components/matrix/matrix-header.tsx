"use client";

import { format, parseISO, getDay } from "date-fns";
import { cn } from "@/lib/utils";

type Props = {
  visibleDates: string[];
  /** CSS grid-template-columns value already applied to the parent grid */
  roomLabelWidth?: string;
};

function isWeekend(dateStr: string): boolean {
  const day = getDay(parseISO(dateStr)); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

export function MatrixHeader({ visibleDates }: Props) {
  return (
    <>
      {/* Corner cell — sticky on both axes */}
      <div
        className="sticky left-0 top-0 z-30 bg-background border-b border-r min-h-[36px]"
        style={{ gridColumn: 1, gridRow: 1 }}
      />

      {/* Date header cells — sticky top only */}
      {visibleDates.map((dateStr, i) => {
        const parsed = parseISO(dateStr);
        const dayName = format(parsed, "EEE");
        const dayNum = format(parsed, "d");
        const weekend = isWeekend(dateStr);

        return (
          <div
            key={dateStr}
            className={cn(
              "sticky top-0 z-20 border-b border-r text-center px-1 py-0.5 min-h-[36px] flex flex-col items-center justify-center select-none",
              weekend
                ? "bg-muted/60 dark:bg-muted/30"
                : "bg-background dark:bg-background"
            )}
            style={{ gridColumn: i + 2, gridRow: 1 }}
          >
            <span className="text-[10px] leading-none text-muted-foreground uppercase tracking-wide">
              {dayName}
            </span>
            <span className="text-xs font-medium leading-tight">{dayNum}</span>
          </div>
        );
      })}
    </>
  );
}
