"use client";

import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MatrixBooking } from "@/actions/bookings/matrix";

type Props = {
  booking: MatrixBooking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  CONFIRMED: "default",
  PENDING: "secondary",
  WAITLISTED: "outline",
  COMPLETED: "default",
};

function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function BookingDetailSheet({ booking, open, onOpenChange, slug }: Props) {
  const firstGuest = booking?.guests[0];
  const guestName =
    firstGuest
      ? [firstGuest.firstName, firstGuest.lastName].filter(Boolean).join(" ") ||
        "Unknown guest"
      : "Unknown guest";

  const allGuests = booking?.guests
    .map((g) => [g.firstName, g.lastName].filter(Boolean).join(" "))
    .filter(Boolean) ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{guestName}</SheetTitle>
        </SheetHeader>

        {booking && (
          <div className="flex flex-col gap-4 px-4 pb-4 flex-1 overflow-y-auto">
            {/* Reference + status */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-mono text-muted-foreground">
                {booking.bookingReference}
              </span>
              <Badge variant={STATUS_VARIANT[booking.status] ?? "outline"}>
                {statusLabel(booking.status)}
              </Badge>
            </div>

            {/* Dates */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Check-in</dt>
              <dd className="font-medium">{formatDate(booking.checkInDate)}</dd>
              <dt className="text-muted-foreground">Check-out</dt>
              <dd className="font-medium">{formatDate(booking.checkOutDate)}</dd>
            </dl>

            {/* Guests list (if more than one) */}
            {allGuests.length > 1 && (
              <div className="text-sm">
                <p className="text-muted-foreground mb-1">Guests</p>
                <ul className="space-y-0.5">
                  {allGuests.map((name, i) => (
                    <li key={i} className="font-medium">
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action */}
            <div className="mt-auto pt-2">
              <Button
                render={<Link href={`/${slug}/admin/bookings/${booking.id}`} />}
                className="w-full"
              >
                View Full Details
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
