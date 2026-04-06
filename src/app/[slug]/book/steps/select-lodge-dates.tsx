"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AvailabilityCalendar } from "@/app/[slug]/admin/availability/availability-calendar";
import { useBooking } from "../booking-context";
import { getMonthAvailability, getOverridesForLodge } from "@/actions/availability/queries";
import { validateBookingDates } from "@/actions/availability/validation";

type Lodge = {
  id: string;
  name: string;
  totalBeds: number;
  checkInTime: string;
  checkOutTime: string;
};

type Season = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

type OpenRound = {
  id: string;
  name: string;
  seasonId: string;
  opensAt: Date;
  closesAt: Date;
  maxNightsPerBooking: number | null;
  maxNightsPerMember: number | null;
  holdDurationMinutes: number | null;
  requiresApproval: boolean;
};

type Props = {
  lodges: Lodge[];
  seasons: Season[];
  openRounds: OpenRound[];
  slug: string;
};

type AvailabilityDay = {
  date: string;
  totalBeds: number;
  bookedBeds: number;
  hasOverride?: boolean;
  eventLabel?: string | null;
};

export function SelectLodgeDates({ lodges, seasons, openRounds, slug }: Props) {
  const booking = useBooking();

  const [selectedLodgeId, setSelectedLodgeId] = useState(
    booking.lodgeId ?? lodges[0]?.id ?? ""
  );
  const [selectedRoundId, setSelectedRoundId] = useState(
    booking.bookingRoundId ?? (openRounds.length === 1 ? openRounds[0].id : "")
  );
  const [checkIn, setCheckIn] = useState<string | null>(booking.checkInDate);
  const [checkOut, setCheckOut] = useState<string | null>(booking.checkOutDate);
  const [availability, setAvailability] = useState<AvailabilityDay[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLodge = lodges.find((l) => l.id === selectedLodgeId);
  const selectedRound = openRounds.find((r) => r.id === selectedRoundId);

  const loadAvailability = useCallback(
    async (lodgeId: string, y: number, m: number) => {
      setLoading(true);
      try {
        const data = await getMonthAvailability(lodgeId, y, m);

        // Get overrides for event labels
        const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        const overrides = await getOverridesForLodge(lodgeId, monthStart, monthEnd);

        const eventLabelMap = new Map<string, string>();
        const overrideDates = new Set<string>();
        for (const o of overrides) {
          const start = new Date(o.startDate + "T00:00:00Z");
          const end = new Date(o.endDate + "T00:00:00Z");
          const cur = new Date(start);
          while (cur <= end) {
            const dateStr = cur.toISOString().split("T")[0];
            overrideDates.add(dateStr);
            if (o.type === "EVENT" && o.reason) {
              eventLabelMap.set(dateStr, o.reason);
            }
            cur.setUTCDate(cur.getUTCDate() + 1);
          }
        }

        setAvailability(
          data.map((a) => ({
            date: a.date,
            totalBeds: a.totalBeds,
            bookedBeds: a.bookedBeds,
            hasOverride: overrideDates.has(a.date),
            eventLabel: eventLabelMap.get(a.date) ?? null,
          }))
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Load availability when lodge changes
  const handleLodgeChange = useCallback(
    (lodgeId: string) => {
      setSelectedLodgeId(lodgeId);
      setCheckIn(null);
      setCheckOut(null);
      loadAvailability(lodgeId, year, month);
    },
    [year, month, loadAvailability]
  );

  const handleMonthChange = useCallback(
    (newYear: number, newMonth: number) => {
      setYear(newYear);
      setMonth(newMonth);
      if (selectedLodgeId) {
        loadAvailability(selectedLodgeId, newYear, newMonth);
      }
    },
    [selectedLodgeId, loadAvailability]
  );

  // Load initial availability
  useEffect(() => {
    if (selectedLodgeId) {
      loadAvailability(selectedLodgeId, year, month);
    }
  }, []);

  const handleDateClick = useCallback(
    (dateStr: string) => {
      if (!checkIn || (checkIn && checkOut)) {
        // Start new selection
        setCheckIn(dateStr);
        setCheckOut(null);
        setError(null);
      } else {
        // Complete selection
        if (dateStr <= checkIn) {
          // Clicked before check-in — reset
          setCheckIn(dateStr);
          setCheckOut(null);
        } else {
          setCheckOut(dateStr);
        }
      }
    },
    [checkIn, checkOut]
  );

  const nights =
    checkIn && checkOut
      ? Math.round(
          (new Date(checkOut + "T00:00:00Z").getTime() -
            new Date(checkIn + "T00:00:00Z").getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

  const canProceed =
    selectedLodgeId && selectedRoundId && checkIn && checkOut && nights > 0;

  async function handleNext() {
    if (!canProceed) return;
    setValidating(true);
    setError(null);

    try {
      const result = await validateBookingDates({
        lodgeId: selectedLodgeId,
        checkIn: checkIn!,
        checkOut: checkOut!,
        bookingRoundId: selectedRoundId,
        memberId: "", // Will use session on server
      });

      if (!result.valid) {
        setError(result.errors[0]);
        return;
      }

      // Update context and advance
      const lodge = lodges.find((l) => l.id === selectedLodgeId);
      const round = openRounds.find((r) => r.id === selectedRoundId);

      booking.setLodge(selectedLodgeId, lodge?.name ?? "");
      booking.setBookingRound(selectedRoundId, round?.name ?? "");
      booking.setDates(checkIn!, checkOut!);
      booking.goToStep(2);
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Lodge selector */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Select Lodge</h2>
        {lodges.length === 1 ? (
          <div className="rounded-lg border p-3">
            <p className="font-medium">{lodges[0].name}</p>
            <p className="text-sm text-muted-foreground">
              {lodges[0].totalBeds} beds
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {lodges.map((lodge) => (
              <button
                key={lodge.id}
                type="button"
                onClick={() => handleLodgeChange(lodge.id)}
                className={`rounded-lg border px-4 py-2 transition-colors ${
                  selectedLodgeId === lodge.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:border-primary/50"
                }`}
              >
                <span className="font-medium">{lodge.name}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {lodge.totalBeds} beds
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Booking round selector */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Booking Round</h2>
        {openRounds.length === 0 ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-3">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              No booking rounds are currently open for your membership class.
            </p>
          </div>
        ) : openRounds.length === 1 ? (
          <div className="rounded-lg border p-3">
            <p className="font-medium">{openRounds[0].name}</p>
            {openRounds[0].maxNightsPerBooking && (
              <p className="text-sm text-muted-foreground">
                Max {openRounds[0].maxNightsPerBooking} nights per booking
              </p>
            )}
          </div>
        ) : (
          <Select value={selectedRoundId} onValueChange={(v) => { if (v) setSelectedRoundId(v); }}>
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue placeholder="Select a booking round" />
            </SelectTrigger>
            <SelectContent>
              {openRounds.map((round) => (
                <SelectItem key={round.id} value={round.id}>
                  {round.name}
                  {round.maxNightsPerBooking &&
                    ` (max ${round.maxNightsPerBooking} nights)`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {selectedRound && (
          <div className="mt-2 text-sm text-muted-foreground space-y-1">
            {selectedRound.maxNightsPerMember && (
              <p>Member limit: {selectedRound.maxNightsPerMember} nights total in this round</p>
            )}
            {selectedRound.requiresApproval && (
              <p>Note: Bookings in this round require committee approval</p>
            )}
          </div>
        )}
      </div>

      {/* Calendar */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Select Dates</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Click a date to set check-in, then click another date to set check-out.
        </p>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Loading availability...
          </div>
        ) : (
          <AvailabilityCalendar
            mode="member"
            availability={availability}
            year={year}
            month={month}
            onMonthChange={handleMonthChange}
            onDateClick={handleDateClick}
            selectedDates={{ checkIn, checkOut }}
          />
        )}

        {checkIn && (
          <div className="mt-3 rounded-lg border p-3">
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Check-in:</span>{" "}
                <span className="font-medium">{checkIn}</span>
                {selectedLodge && (
                  <span className="text-muted-foreground">
                    {" "}
                    from {selectedLodge.checkInTime}
                  </span>
                )}
              </div>
              {checkOut && (
                <>
                  <div>
                    <span className="text-muted-foreground">Check-out:</span>{" "}
                    <span className="font-medium">{checkOut}</span>
                    {selectedLodge && (
                      <span className="text-muted-foreground">
                        {" "}
                        by {selectedLodge.checkOutTime}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Nights:</span>{" "}
                    <span className="font-medium">{nights}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-end">
        <Button onClick={handleNext} disabled={!canProceed || validating}>
          {validating ? "Validating..." : "Next: Add Guests"}
        </Button>
      </div>
    </div>
  );
}
