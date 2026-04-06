"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBooking } from "../booking-context";
import { getAvailableBeds, type RoomWithBeds } from "@/actions/bookings/beds";
import { createBedHold, releaseBedHold } from "@/actions/bookings/holds";

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
  const [rooms, setRooms] = useState<RoomWithBeds[]>([]);
  const [loading, setLoading] = useState(true);
  const [holdTimerDisplay, setHoldTimerDisplay] = useState<string | null>(null);
  const [holdExpired, setHoldExpired] = useState(false);

  const loadBeds = useCallback(async () => {
    if (!booking.lodgeId || !booking.checkInDate || !booking.checkOutDate) return;
    setLoading(true);
    try {
      const result = await getAvailableBeds(
        booking.lodgeId,
        booking.checkInDate,
        booking.checkOutDate,
        memberId
      );
      setRooms(result);
    } finally {
      setLoading(false);
    }
  }, [booking.lodgeId, booking.checkInDate, booking.checkOutDate, memberId]);

  useEffect(() => {
    loadBeds();
  }, [loadBeds]);

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

  // Get the next unassigned guest
  const assignedMemberIds = new Set(
    booking.bedAssignments.map((a) => a.memberId)
  );
  const nextUnassignedGuest = booking.guests.find(
    (g) => !assignedMemberIds.has(g.memberId)
  );

  const guestColorMap = new Map<string, string>();
  booking.guests.forEach((g, i) => {
    guestColorMap.set(g.memberId, GUEST_COLORS[i % GUEST_COLORS.length]);
  });

  async function handleBedClick(
    bedId: string,
    bedLabel: string,
    roomId: string,
    roomName: string,
    status: string
  ) {
    if (status === "booked" || status === "held") return;

    if (status === "held-by-you") {
      // Deselect — find which guest has this bed and remove assignment
      const assignment = booking.bedAssignments.find((a) => a.bedId === bedId);
      if (assignment) {
        booking.removeBedAssignment(assignment.memberId);
        await releaseBedHold(bedId, memberId);
        await loadBeds();
      }
      return;
    }

    // Assign to next unassigned guest
    if (!nextUnassignedGuest) return;

    booking.addBedAssignment({
      memberId: nextUnassignedGuest.memberId,
      bedId,
      bedLabel,
      roomId,
      roomName,
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
      } else if (!result.success) {
        booking.removeBedAssignment(nextUnassignedGuest.memberId);
        booking.setError(result.error ?? "Failed to hold bed");
        await loadBeds();
      }
    }
  }

  const allAssigned = booking.bedAssignments.length === booking.guests.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Select Beds</h2>
        <p className="text-sm text-muted-foreground mb-2">
          Click a bed to assign it to {nextUnassignedGuest
            ? `${nextUnassignedGuest.firstName} ${nextUnassignedGuest.lastName}`
            : "the next guest"}.
          Click a selected bed to deselect it.
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
              loadBeds();
            }}
          >
            Refresh Availability
          </Button>
        </div>
      )}

      {/* Guest assignment legend */}
      <div className="flex flex-wrap gap-2">
        {booking.guests.map((guest, i) => {
          const isAssigned = assignedMemberIds.has(guest.memberId);
          const assignment = booking.bedAssignments.find(
            (a) => a.memberId === guest.memberId
          );
          return (
            <div
              key={guest.memberId}
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

      {/* Room/bed grid */}
      {loading ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground">
          Loading beds...
        </div>
      ) : (
        <div className="space-y-4">
          {rooms.map((room) => (
            <div key={room.id} className="rounded-lg border p-4">
              <h3 className="font-medium mb-2">
                {room.name}
                {room.floor && (
                  <span className="text-sm text-muted-foreground ml-2">
                    Floor {room.floor}
                  </span>
                )}
              </h3>
              <div className="flex flex-wrap gap-2">
                {room.beds.map((bed) => {
                  const assignment = booking.bedAssignments.find(
                    (a) => a.bedId === bed.id
                  );
                  const guestColor = assignment
                    ? guestColorMap.get(assignment.memberId) ?? ""
                    : "";

                  let bedClass = "";
                  let label = bed.label;
                  let disabled = false;

                  switch (bed.status) {
                    case "available":
                      bedClass =
                        "border-green-300 bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-950/40 cursor-pointer";
                      break;
                    case "booked":
                      bedClass =
                        "border-red-300 bg-red-50 dark:bg-red-950/20 opacity-60 cursor-not-allowed";
                      label += " (booked)";
                      disabled = true;
                      break;
                    case "held":
                      bedClass =
                        "border-amber-300 bg-amber-50 dark:bg-amber-950/20 opacity-60 cursor-not-allowed";
                      label += " (held)";
                      disabled = true;
                      break;
                    case "held-by-you":
                      bedClass = `border-primary ${guestColor} cursor-pointer ring-2 ring-primary`;
                      break;
                  }

                  return (
                    <button
                      key={bed.id}
                      type="button"
                      disabled={disabled || (!nextUnassignedGuest && bed.status === "available")}
                      onClick={() =>
                        handleBedClick(
                          bed.id,
                          bed.label,
                          room.id,
                          room.name,
                          assignment ? "held-by-you" : bed.status
                        )
                      }
                      className={`rounded-md border px-3 py-2 text-sm transition-colors ${bedClass}`}
                    >
                      {bed.label}
                      {assignment && (
                        <div className="text-xs mt-0.5">
                          {booking.guests.find(
                            (g) => g.memberId === assignment.memberId
                          )?.firstName ?? ""}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

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
