"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OpenRoundSummary = {
  id: string;
  name: string;
};

export type BookingPopoverSelection = {
  date: string;
  bedId: string;
  bedLabel: string;
  roundId: string;
  roundName: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The anchor element ref — the popover positions relative to this */
  anchorRef: React.RefObject<HTMLElement | null>;
  date: string;
  bedId: string;
  bedLabel: string;
  lodgeName: string;
  openRounds: OpenRoundSummary[];
  onStartBooking: (selection: BookingPopoverSelection) => void;
};

export function BookingPopover({
  open,
  onOpenChange,
  anchorRef,
  date,
  bedId,
  bedLabel,
  lodgeName,
  openRounds,
  onStartBooking,
}: Props) {
  const formattedDate = format(parseISO(date), "EEEE d MMMM yyyy");
  const hasRounds = openRounds.length > 0;
  const singleRound = openRounds.length === 1;

  const [selectedRoundId, setSelectedRoundId] = useState(openRounds[0]?.id ?? "");

  function handleStartClick() {
    const round = openRounds.find((r) => r.id === selectedRoundId);
    if (!round) return;

    onStartBooking({
      date,
      bedId,
      bedLabel,
      roundId: round.id,
      roundName: round.name,
    });
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-72 p-4"
        anchor={anchorRef}
      >
        <div className="space-y-3">
          <div>
            <p className="font-medium text-sm">{formattedDate}</p>
            <p className="text-sm text-muted-foreground">
              {lodgeName} &middot; {bedLabel}
            </p>
          </div>

          {!hasRounds ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              No booking rounds are currently open.
            </p>
          ) : (
            <div>
              {singleRound ? (
                <div className="rounded border p-2 text-sm mb-3">
                  <p className="font-medium">{openRounds[0].name}</p>
                </div>
              ) : (
                <div className="mb-3">
                  <label className="text-sm font-medium mb-1 block">
                    Booking Round
                  </label>
                  <Select value={selectedRoundId} onValueChange={(v) => { if (v) setSelectedRoundId(v); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select round" />
                    </SelectTrigger>
                    <SelectContent>
                      {openRounds.map((round) => (
                        <SelectItem key={round.id} value={round.id}>
                          {round.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button onClick={handleStartClick} className="w-full">
                Start Booking
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
