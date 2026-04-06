"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useBooking } from "./booking-context";

type Props = {
  slug: string;
};

export function BookingSuccess({ slug }: Props) {
  const booking = useBooking();

  const nights =
    booking.checkInDate && booking.checkOutDate
      ? Math.round(
          (new Date(booking.checkOutDate + "T00:00:00Z").getTime() -
            new Date(booking.checkInDate + "T00:00:00Z").getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

  return (
    <div className="max-w-lg mx-auto text-center space-y-6 py-8">
      {/* Success icon */}
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <svg
          className="h-8 w-8 text-green-600 dark:text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-1">Booking Confirmed</h2>
        <p className="text-muted-foreground">
          Your booking has been successfully created.
        </p>
      </div>

      {/* Reference number */}
      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
        <p className="text-sm text-muted-foreground mb-1">Booking Reference</p>
        <p className="text-3xl font-bold font-mono tracking-wider">
          {booking.bookingReference}
        </p>
      </div>

      {/* Details */}
      <div className="rounded-lg border p-4 text-left space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Lodge</span>
          <span className="font-medium">{booking.lodgeName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Check-in</span>
          <span>{booking.checkInDate}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Check-out</span>
          <span>{booking.checkOutDate}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Nights</span>
          <span>{nights}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Guests</span>
          <span>{booking.guests.length}</span>
        </div>
      </div>

      {/* Guest list */}
      <div className="rounded-lg border p-4 text-left">
        <h3 className="font-medium text-sm mb-2">Guests &amp; Beds</h3>
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

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button render={<Link href={`/${slug}/dashboard`} />}>
          View My Bookings
        </Button>
        <Button variant="outline" onClick={() => booking.reset()}>
          Make Another Booking
        </Button>
      </div>
    </div>
  );
}
