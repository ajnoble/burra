"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useBooking } from "../booking-context";
import { createBooking } from "@/actions/bookings/create";
import { formatCurrency } from "@/lib/currency";

type Lodge = {
  id: string;
  name: string;
  totalBeds: number;
  checkInTime: string;
  checkOutTime: string;
};

type Props = {
  organisationId: string;
  slug: string;
  lodges: Lodge[];
};

export function Confirm({ organisationId, slug, lodges }: Props) {
  const booking = useBooking();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lodge = lodges.find((l) => l.id === booking.lodgeId);

  const nights =
    booking.checkInDate && booking.checkOutDate
      ? Math.round(
          (new Date(booking.checkOutDate + "T00:00:00Z").getTime() -
            new Date(booking.checkInDate + "T00:00:00Z").getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

  async function handleConfirm() {
    if (!booking.lodgeId || !booking.bookingRoundId || !booking.checkInDate || !booking.checkOutDate) {
      setError("Missing booking details. Please go back and try again.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await createBooking(
        {
          organisationId,
          lodgeId: booking.lodgeId,
          bookingRoundId: booking.bookingRoundId,
          checkInDate: booking.checkInDate,
          checkOutDate: booking.checkOutDate,
          guests: booking.bedAssignments.map((a) => ({
            memberId: a.memberId,
            bedId: a.bedId,
            roomId: a.roomId,
          })),
        },
        slug
      );

      if (result.success && result.bookingReference) {
        booking.setBookingReference(result.bookingReference);
      } else {
        setError(result.error ?? "Booking failed. Please try again.");

        // If bed conflict, go back to step 3
        if (
          result.error?.includes("no longer available") ||
          result.error?.includes("reselect")
        ) {
          booking.setBedAssignments([]);
          booking.setHoldExpiresAt(null);
          setTimeout(() => booking.goToStep(3), 2000);
        }
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h2 className="text-lg font-semibold mb-2">Confirm Your Booking</h2>
        <p className="text-sm text-muted-foreground">
          Please review the details below and confirm your booking.
        </p>
      </div>

      {/* Summary card */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Lodge</span>
            <span className="font-medium">{booking.lodgeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dates</span>
            <span>
              {booking.checkInDate} &mdash; {booking.checkOutDate}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nights</span>
            <span>{nights}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Guests</span>
            <span>{booking.guests.length}</span>
          </div>
          {booking.pricingResult && booking.pricingResult.totalAmountCents > 0 && (
            <div className="flex justify-between pt-2 border-t font-bold">
              <span>Total</span>
              <span>
                {formatCurrency(booking.pricingResult.totalAmountCents)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Guest list */}
      <div className="rounded-lg border p-4">
        <h3 className="font-medium text-sm mb-2">Guests</h3>
        <div className="space-y-1 text-sm">
          {booking.bedAssignments.map((a) => {
            const guest = booking.guests.find(
              (g) => g.memberId === a.memberId
            );
            return (
              <div key={a.memberId} className="flex justify-between">
                <span>
                  {guest?.firstName} {guest?.lastName}
                </span>
                <span className="text-muted-foreground">
                  {a.roomName} / {a.bedLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => booking.goToStep(4)}>
          Back
        </Button>
        <Button onClick={handleConfirm} disabled={submitting}>
          {submitting ? "Confirming..." : "Confirm Booking"}
        </Button>
      </div>
    </div>
  );
}
