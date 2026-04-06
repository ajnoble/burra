"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type AvailabilityDay = {
  date: string;
  totalBeds: number;
  bookedBeds: number;
  hasOverride?: boolean;
  eventLabel?: string | null;
};

type AvailabilityCalendarProps = {
  mode: "admin" | "member";
  availability: AvailabilityDay[];
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
  onDateClick?: (date: string) => void;
  selectedDates?: { checkIn: string | null; checkOut: string | null };
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

function getAvailabilityColor(
  totalBeds: number,
  bookedBeds: number,
  hasOverride: boolean,
  mode: "admin" | "member"
): string {
  if (totalBeds === 0) return "bg-zinc-300 dark:bg-zinc-700";
  const available = totalBeds - bookedBeds;
  if (available <= 0) return "bg-red-200 dark:bg-red-900";
  const ratio = available / totalBeds;
  if (ratio <= 0.5) return "bg-amber-200 dark:bg-amber-900";
  return "bg-green-200 dark:bg-green-900";
}

function getAvailabilityLabel(
  totalBeds: number,
  bookedBeds: number,
  mode: "admin" | "member"
): string {
  const available = totalBeds - bookedBeds;
  if (totalBeds === 0) return mode === "admin" ? "Closed" : "Unavailable";
  if (available <= 0) return mode === "admin" ? "0/" + totalBeds : "Unavailable";
  if (mode === "admin") return `${available}/${totalBeds}`;
  const ratio = available / totalBeds;
  if (ratio <= 0.5) return "Limited";
  return "Available";
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AvailabilityCalendar({
  mode,
  availability,
  year,
  month,
  onMonthChange,
  onDateClick,
  selectedDates,
}: AvailabilityCalendarProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  const availabilityMap = new Map(
    availability.map((a) => [a.date, a])
  );

  function handlePrev() {
    if (month === 1) {
      onMonthChange(year - 1, 12);
    } else {
      onMonthChange(year, month - 1);
    }
  }

  function handleNext() {
    if (month === 12) {
      onMonthChange(year + 1, 1);
    } else {
      onMonthChange(year, month + 1);
    }
  }

  function isDateInRange(dateStr: string): boolean {
    if (!selectedDates?.checkIn || !selectedDates?.checkOut) return false;
    return dateStr >= selectedDates.checkIn && dateStr < selectedDates.checkOut;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" size="sm" onClick={handlePrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-semibold">
          {MONTH_NAMES[month - 1]} {year}
        </h3>
        <Button variant="outline" size="sm" onClick={handleNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-muted-foreground py-1"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="h-16" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const data = availabilityMap.get(dateStr);
          const totalBeds = data?.totalBeds ?? 0;
          const bookedBeds = data?.bookedBeds ?? 0;
          const hasOverride = data?.hasOverride ?? false;
          const eventLabel = data?.eventLabel ?? null;
          const hasData = !!data;
          const inRange = isDateInRange(dateStr);

          const colorClass = hasData
            ? getAvailabilityColor(totalBeds, bookedBeds, hasOverride, mode)
            : "bg-muted/50";

          const label = hasData
            ? getAvailabilityLabel(totalBeds, bookedBeds, mode)
            : "";

          const rangeClass = inRange ? "ring-2 ring-primary" : "";

          return (
            <button
              key={dateStr}
              type="button"
              className={`h-16 rounded-md p-1 text-left transition-colors hover:ring-2 hover:ring-ring ${colorClass} ${rangeClass} ${
                onDateClick ? "cursor-pointer" : "cursor-default"
              }`}
              onClick={() => onDateClick?.(dateStr)}
              disabled={!onDateClick}
            >
              <div className="text-xs font-medium">{day}</div>
              {hasData && (
                <div className="text-[10px] leading-tight mt-0.5">
                  {label}
                  {mode === "admin" && hasOverride && !eventLabel && (
                    <span className="ml-0.5" title="Override active">*</span>
                  )}
                </div>
              )}
              {eventLabel && (
                <div
                  className="text-[9px] leading-tight text-blue-700 dark:text-blue-400 truncate"
                  title={eventLabel}
                >
                  {eventLabel}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
