"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBooking, guestKey } from "../booking-context";
import { createBedHold, releaseBedHold } from "@/actions/bookings/holds";
import { getMatrixData, type MatrixData } from "@/actions/bookings/matrix";
import {
  BookingMatrix,
  useMatrixState,
  useBreakpoint,
} from "@/components/matrix";

type Props = {
  organisationId: string;
  memberId: string;
  slug: string;
};

const GUEST_COLORS = [
  "bg-blue-200 dark:bg-blue-800",
  "bg-green-200 dark:bg-green-800",
  "bg-purple-200 dark:bg-purple-800",
  "bg-orange-200 dark:bg-orange-800",
  "bg-pink-200 dark:bg-pink-800",
  "bg-teal-200 dark:bg-teal-800",
];

function formatTimeRemaining(expiresAt: Date): string {
  const remaining = Math.max(
    0,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  );
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function SelectBeds({ organisationId, memberId, slug }: Props) {
  const booking = useBooking();
  const [matrixData, setMatrixData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [holdTimerDisplay, setHoldTimerDisplay] = useState<string | null>(null);
  const [holdExpired, setHoldExpired] = useState(false);

  const breakpoint = useBreakpoint();
  const matrixState = useMatrixState({
    initialDate: booking.checkInDate ?? undefined,
    breakpoint,
    // Clamp navigation to the booking window
    seasonStartDate: booking.checkInDate ?? undefined,
    seasonEndDate: booking.checkOutDate ?? undefined,
  });

  const loadData = useCallback(async () => {
    if (!booking.lodgeId || !booking.checkInDate || !booking.checkOutDate) return;
    setLoading(true);
    try {
      const data = await getMatrixData(
        booking.lodgeId,
        booking.checkInDate,
        booking.checkOutDate
      );
      setMatrixData(data);
    } finally {
      setLoading(false);
    }
  }, [booking.lodgeId, booking.checkInDate, booking.checkOutDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Hold timer
  useEffect(() => {
    if (!booking.holdExpiresAt) {
      setHoldTimerDisplay(null);
      return;
    }

    const interval = setInterval(() => {
      const remaining = booking.holdExpiresAt!.getTime() - Date.now();
      if (remaining <= 0) {
        setHoldExpired(true);
        setHoldTimerDisplay("0:00");
        clearInterval(interval);
      } else {
        setHoldTimerDisplay(formatTimeRemaining(booking.holdExpiresAt!));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [booking.holdExpiresAt]);

  // Split guests: cot guests don't need beds
  const bedGuests = booking.guests.filter((g) => !g.portaCotRequested);
  const cotGuests = booking.guests.filter((g) => g.portaCotRequested);

  // Get the next unassigned bed guest
  const assignedGuestKeys = new Set(
    booking.bedAssignments.map((a) => a.guestKey)
  );
  const nextUnassignedGuest = bedGuests.find(
    (g) => !assignedGuestKeys.has(guestKey(g))
  );

  // Color map: guestKey → CSS color class
  const guestColorMap = useMemo(() => {
    const map = new Map<string, string>();
    bedGuests.forEach((g, i) => {
      map.set(guestKey(g), GUEST_COLORS[i % GUEST_COLORS.length]);
    });
    return map;
  }, [bedGuests]);

  // Wizard-specific data for BookingMatrix: beds held-by-you and their colors
  const wizardHeldBedIds = useMemo(
    () => new Set(booking.bedAssignments.map((a) => a.bedId)),
    [booking.bedAssignments]
  );

  const wizardBedColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const assignment of booking.bedAssignments) {
      const color = guestColorMap.get(assignment.guestKey);
      if (color) map.set(assignment.bedId, color);
    }
    return map;
  }, [booking.bedAssignments, guestColorMap]);

  // Find room/bed labels from matrix data for assignment metadata
  function findBedMeta(bedId: string): { bedLabel: string; roomId: string; roomName: string } | null {
    if (!matrixData) return null;
    for (const room of matrixData.rooms) {
      const bed = room.beds.find((b) => b.id === bedId);
      if (bed) {
        return { bedLabel: bed.label, roomId: room.id, roomName: room.name };
      }
    }
    return null;
  }

  async function handleCellClick(bedId: string, _date: string) {
    // Determine if this bed is currently held-by-you
    const existingAssignment = booking.bedAssignments.find(
      (a) => a.bedId === bedId
    );

    if (existingAssignment) {
      // Deselect — remove assignment and release hold
      booking.removeBedAssignment(existingAssignment.guestKey);
      await releaseBedHold(bedId, memberId);
      await loadData();
      return;
    }

    // Assign to next unassigned bed guest
    if (!nextUnassignedGuest) return;

    const meta = findBedMeta(bedId);
    if (!meta) return;

    const nextGuestKey = guestKey(nextUnassignedGuest);

    booking.addBedAssignment({
      guestKey: nextGuestKey,
      bedId,
      bedLabel: meta.bedLabel,
      roomId: meta.roomId,
      roomName: meta.roomName,
    });

    // Create hold
    if (booking.bookingRoundId && booking.checkInDate && booking.checkOutDate) {
      const result = await createBedHold(
        {
          lodgeId: booking.lodgeId!,
          bedId,
          bookingRoundId: booking.bookingRoundId,
          checkInDate: booking.checkInDate,
          checkOutDate: booking.checkOutDate,
        },
        memberId
      );

      if (result.success && result.expiresAt) {
        booking.setHoldExpiresAt(result.expiresAt);
        setHoldExpired(false);
        await loadData();
      } else if (!result.success) {
        booking.removeBedAssignment(nextGuestKey);
        booking.setError(result.error ?? "Failed to hold bed");
        await loadData();
      }
    }
  }

  const allAssigned = booking.bedAssignments.length === bedGuests.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Select Beds</h2>
        <p className="text-sm text-muted-foreground mb-2">
          Click a bed to assign it to{" "}
          {nextUnassignedGuest
            ? `${nextUnassignedGuest.firstName} ${nextUnassignedGuest.lastName}`
            : "the next guest"}
          . Click a selected bed to deselect it.
        </p>
      </div>

      {/* Hold timer banner */}
      {holdTimerDisplay && !holdExpired && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-3">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Your bed holds expire in{" "}
            <span className="font-mono font-bold">{holdTimerDisplay}</span>.
            Complete your booking before time runs out.
          </p>
        </div>
      )}

      {holdExpired && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">
            Your bed holds have expired. Please reselect your beds.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              booking.setBedAssignments([]);
              booking.setHoldExpiresAt(null);
              setHoldExpired(false);
              loadData();
            }}
          >
            Refresh Availability
          </Button>
        </div>
      )}

      {/* Port-a-cot guests info box */}
      {cotGuests.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
            Port-a-cot Guests
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-400 mb-2">
            The following guests will use a port-a-cot and do not need a bed assigned.
          </p>
          <div className="flex flex-wrap gap-1">
            {cotGuests.map((g) => (
              <Badge key={guestKey(g)} variant="secondary" className="text-xs">
                {g.firstName} {g.lastName}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Guest assignment legend — only bed guests */}
      <div className="flex flex-wrap gap-2">
        {bedGuests.map((guest, i) => {
          const key = guestKey(guest);
          const isAssigned = assignedGuestKeys.has(key);
          const assignment = booking.bedAssignments.find(
            (a) => a.guestKey === key
          );
          return (
            <div
              key={key}
              className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${
                isAssigned ? "opacity-50" : ""
              }`}
            >
              <div
                className={`h-3 w-3 rounded-full ${GUEST_COLORS[i % GUEST_COLORS.length]}`}
              />
              <span>
                {guest.firstName} {guest.lastName}
                {assignment && ` — ${assignment.bedLabel} (${assignment.roomName})`}
              </span>
              {isAssigned && <span className="text-green-600">&#10003;</span>}
            </div>
          );
        })}
      </div>

      {/* Booking matrix */}
      {loading ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground">
          Loading beds...
        </div>
      ) : matrixData ? (
        <div className="h-96">
          <BookingMatrix
            data={matrixData}
            state={matrixState}
            currentMemberId={memberId}
            onCellClick={handleCellClick}
            wizardHeldBedIds={wizardHeldBedIds}
            wizardBedColorMap={wizardBedColorMap}
          />
        </div>
      ) : null}

      {/* Error */}
      {booking.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{booking.error}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => booking.goToStep(2)}>
          Back
        </Button>
        <Button
          onClick={() => {
            booking.setError(null);
            booking.goToStep(4);
          }}
          disabled={!allAssigned || holdExpired}
        >
          Next: Review &amp; Pricing
        </Button>
      </div>
    </div>
  );
}
