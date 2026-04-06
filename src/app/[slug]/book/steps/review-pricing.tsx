"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useBooking, type PricingResult, type GuestPriceInfo } from "../booking-context";
import { formatCurrency } from "@/lib/currency";
import {
  calculateGuestPrice,
  calculateBookingPrice,
  type GuestPriceResult,
} from "@/actions/bookings/pricing";

type Lodge = {
  id: string;
  name: string;
  totalBeds: number;
  checkInTime: string;
  checkOutTime: string;
};

type Props = {
  organisationId: string;
  lodges: Lodge[];
};

export function ReviewPricing({ organisationId, lodges }: Props) {
  const booking = useBooking();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const lodge = lodges.find((l) => l.id === booking.lodgeId);

  useEffect(() => {
    async function loadPricing() {
      if (!booking.lodgeId || !booking.checkInDate || !booking.checkOutDate) {
        setError("Missing booking details");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // For now, we'll use placeholder tariff data
        // In production, this calls the server action with real tariff lookup
        // The pricing calculation itself is done client-side for display,
        // but the final price is recalculated server-side during createBooking
        const guestPrices: GuestPriceInfo[] = [];
        let subtotal = 0;
        let discount = 0;
        let total = 0;

        // We need to fetch pricing from server
        const response = await fetch(
          `/api/pricing?` +
            new URLSearchParams({
              lodgeId: booking.lodgeId,
              checkInDate: booking.checkInDate,
              checkOutDate: booking.checkOutDate,
              guestMemberIds: booking.guests.map((g) => g.memberId).join(","),
            })
        );

        // If API doesn't exist yet, compute a placeholder
        // The real price is always computed server-side in createBooking
        if (!response.ok) {
          // Mark as needing server-side calculation
          booking.setPricingResult({
            guests: booking.guests.map((g) => {
              const assignment = booking.bedAssignments.find(
                (a) => a.memberId === g.memberId
              );
              return {
                memberId: g.memberId,
                firstName: g.firstName,
                lastName: g.lastName,
                membershipClassName: g.membershipClassName,
                bedLabel: assignment?.bedLabel ?? "",
                roomName: assignment?.roomName ?? "",
                subtotalCents: 0,
                discountAmountCents: 0,
                totalCents: 0,
                blendedPerNightCents: 0,
              };
            }),
            subtotalCents: 0,
            discountAmountCents: 0,
            totalAmountCents: 0,
          });
        } else {
          const pricingData = await response.json();
          booking.setPricingResult(pricingData);
        }
      } catch {
        // Pricing will be calculated server-side during confirmation
        // Show the booking summary without pricing for now
        booking.setPricingResult(null);
      } finally {
        setLoading(false);
      }
    }

    loadPricing();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nights =
    booking.checkInDate && booking.checkOutDate
      ? Math.round(
          (new Date(booking.checkOutDate + "T00:00:00Z").getTime() -
            new Date(booking.checkInDate + "T00:00:00Z").getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Review Your Booking</h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Booking Summary */}
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="font-medium">Booking Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lodge</span>
              <span className="font-medium">{booking.lodgeName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-in</span>
              <span>
                {booking.checkInDate}
                {lodge && (
                  <span className="text-muted-foreground">
                    {" "}
                    from {lodge.checkInTime}
                  </span>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-out</span>
              <span>
                {booking.checkOutDate}
                {lodge && (
                  <span className="text-muted-foreground">
                    {" "}
                    by {lodge.checkOutTime}
                  </span>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nights</span>
              <span>{nights}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Booking Round</span>
              <span>{booking.bookingRoundName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Guests</span>
              <span>{booking.guests.length}</span>
            </div>
          </div>
        </div>

        {/* Right: Price Breakdown */}
        <div className="rounded-lg border p-4">
          <h3 className="font-medium mb-3">Price Breakdown</h3>

          {loading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              Calculating pricing...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left pb-2 pr-2">Bed Details</th>
                    <th className="text-left pb-2 pr-2">Name</th>
                    <th className="text-left pb-2 pr-2">Tariff</th>
                    <th className="text-right pb-2">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {booking.guests.map((guest) => {
                    const assignment = booking.bedAssignments.find(
                      (a) => a.memberId === guest.memberId
                    );
                    const pricing = booking.pricingResult?.guests.find(
                      (g) => g.memberId === guest.memberId
                    );

                    return (
                      <tr key={guest.memberId} className="border-b last:border-b-0">
                        <td className="py-2 pr-2">
                          {assignment
                            ? `${assignment.roomName} / ${assignment.bedLabel}`
                            : "-"}
                        </td>
                        <td className="py-2 pr-2">
                          {guest.firstName} {guest.lastName}
                        </td>
                        <td className="py-2 pr-2">
                          {guest.membershipClassName || "Standard"}
                        </td>
                        <td className="py-2 text-right">
                          {pricing && pricing.totalCents > 0
                            ? formatCurrency(pricing.totalCents)
                            : "TBD"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {booking.pricingResult &&
                booking.pricingResult.totalAmountCents > 0 && (
                  <div className="mt-3 space-y-1 border-t pt-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>
                        {formatCurrency(booking.pricingResult.subtotalCents)}
                      </span>
                    </div>
                    {booking.pricingResult.discountAmountCents > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Discount</span>
                        <span>
                          -
                          {formatCurrency(
                            booking.pricingResult.discountAmountCents
                          )}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-base">
                      <span>Total</span>
                      <span>
                        {formatCurrency(
                          booking.pricingResult.totalAmountCents
                        )}
                      </span>
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 p-3">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          An invoice will be created when you confirm. Payment can be made later
          via your dashboard.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => booking.goToStep(3)}>
          Back
        </Button>
        <Button onClick={() => booking.goToStep(5)}>Next: Confirm</Button>
      </div>
    </div>
  );
}
