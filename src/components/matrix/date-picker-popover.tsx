"use client";

import { useState } from "react";
import { format, parseISO, getDaysInMonth, startOfMonth, getDay } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Exported helpers (also used in tests)
// ---------------------------------------------------------------------------

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Returns an array of years centred on `currentYear` (±2 by default),
 * extended to include the year from `seasonEndDate` if it falls outside that range.
 */
export function getYearRange(
  currentYear: number,
  seasonStartDate?: string,
  seasonEndDate?: string
): number[] {
  let minYear = currentYear - 2;
  let maxYear = currentYear + 2;

  if (seasonStartDate) {
    const startYear = parseISO(seasonStartDate).getFullYear();
    if (startYear < minYear) minYear = startYear;
  }

  if (seasonEndDate) {
    const endYear = parseISO(seasonEndDate).getFullYear();
    if (endYear > maxYear) maxYear = endYear;
  }

  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y++) {
    years.push(y);
  }
  return years;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  onDateSelect: (date: string) => void;
  seasonStartDate?: string;
  seasonEndDate?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DatePickerPopover({
  startDate,
  endDate,
  onDateSelect,
  seasonStartDate,
  seasonEndDate,
}: Props) {
  const startLabel = format(parseISO(startDate), "d MMM yyyy");
  const endLabel = format(parseISO(endDate), "d MMM yyyy");

  // Calendar navigation state — default to the month of startDate
  const [calMonth, setCalMonth] = useState<number>(() => parseISO(startDate).getMonth());
  const [calYear, setCalYear] = useState<number>(() => parseISO(startDate).getFullYear());
  const [open, setOpen] = useState(false);

  const years = getYearRange(new Date().getFullYear(), seasonStartDate, seasonEndDate);

  // Build the mini calendar grid
  const firstDay = new Date(calYear, calMonth, 1);
  const daysInMonth = getDaysInMonth(firstDay);
  const startDayOfWeek = getDay(startOfMonth(firstDay)); // 0=Sun

  // Padding cells before the first day
  const paddingCells = Array.from({ length: startDayOfWeek });
  const dayCells = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  function isDisabled(day: number): boolean {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (seasonStartDate && dateStr < seasonStartDate) return true;
    if (seasonEndDate && dateStr > seasonEndDate) return true;
    return false;
  }

  function handleDayClick(day: number) {
    if (isDisabled(day)) return;
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onDateSelect(dateStr);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
          />
        }
      >
        <CalendarDays className="size-4 shrink-0" />
        <span>
          {startLabel} – {endLabel}
        </span>
      </PopoverTrigger>

      <PopoverContent className="w-72 p-3" align="start">
        {/* Month / Year selectors */}
        <div className="flex gap-2 mb-3">
          <Select
            value={String(calMonth)}
            onValueChange={(v) => setCalMonth(Number(v))}
          >
            <SelectTrigger size="sm" className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, idx) => (
                <SelectItem key={name} value={String(idx)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(calYear)}
            onValueChange={(v) => setCalYear(Number(v))}
          >
            <SelectTrigger size="sm" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 mb-1">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div
              key={d}
              className="text-center text-xs text-muted-foreground py-1 font-medium"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {/* Padding cells */}
          {paddingCells.map((_, i) => (
            <div key={`pad-${i}`} />
          ))}

          {/* Day cells */}
          {dayCells.map((day) => {
            const disabled = isDisabled(day);
            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                onClick={() => handleDayClick(day)}
                className={[
                  "h-7 w-full rounded text-sm text-center transition-colors",
                  disabled
                    ? "text-muted-foreground/40 cursor-not-allowed"
                    : "hover:bg-accent hover:text-accent-foreground cursor-pointer",
                ].join(" ")}
              >
                {day}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
