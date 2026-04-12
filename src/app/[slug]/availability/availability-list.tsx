"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMatrixData, type MatrixData } from "@/actions/bookings/matrix";

type Props = {
  lodgeId: string;
  slug: string;
  seasonStartDate?: string;
  seasonEndDate?: string;
};

type BedStatus = "available" | "booked" | "held" | "closed";

function getBedStatus(
  bedId: string,
  checkIn: string,
  checkOut: string,
  data: MatrixData
): BedStatus {
  // Check for closed override
  const isClosed = data.overrides.some(
    (o) =>
      o.type === "CLOSED" &&
      o.startDate < checkOut &&
      o.endDate > checkIn
  );
  if (isClosed) return "closed";

  // Check for active hold
  const isHeld = data.holds.some(
    (h) =>
      h.bedId === bedId &&
      h.checkInDate < checkOut &&
      h.checkOutDate > checkIn
  );
  if (isHeld) return "held";

  // Check for booking
  const isBooked = data.bookings.some((booking) =>
    booking.guests.some(
      (g) =>
        g.bedId === bedId &&
        booking.checkInDate < checkOut &&
        booking.checkOutDate > checkIn
    )
  );
  if (isBooked) return "booked";

  return "available";
}

const statusLabel: Record<BedStatus, string> = {
  available: "Available",
  booked: "Booked",
  held: "Held",
  closed: "Closed",
};

const statusClass: Record<BedStatus, string> = {
  available: "text-green-700 dark:text-green-400",
  booked: "text-red-600 dark:text-red-400",
  held: "text-amber-600 dark:text-amber-400",
  closed: "text-gray-500 dark:text-gray-400",
};

export function AvailabilityList({
  lodgeId,
  slug,
  seasonStartDate,
  seasonEndDate,
}: Props) {
  const [checkIn, setCheckIn] = useState(seasonStartDate ?? "");
  const [checkOut, setCheckOut] = useState("");
  const [data, setData] = useState<MatrixData | null>(null);
  const [collapsedRooms, setCollapsedRooms] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleRoom(roomId: string) {
    setCollapsedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  }

  function handleSearch() {
    if (!checkIn || !checkOut) return;
    if (checkIn >= checkOut) {
      setError("Check-out must be after check-in.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await getMatrixData(lodgeId, checkIn, checkOut);
        setData(result);
      } catch {
        setError("Failed to load availability. Please try again.");
      }
    });
  }

  const bookingUrl = (bedId?: string) => {
    const params = new URLSearchParams({ checkIn, checkOut });
    if (bedId) params.set("bed", bedId);
    return `/${slug}/book?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Date inputs */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="check-in">Check-in</Label>
          <Input
            id="check-in"
            type="date"
            value={checkIn}
            min={seasonStartDate}
            max={seasonEndDate}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="check-out">Check-out</Label>
          <Input
            id="check-out"
            type="date"
            value={checkOut}
            min={checkIn || seasonStartDate}
            max={seasonEndDate}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button
            onClick={handleSearch}
            disabled={!checkIn || !checkOut || isPending}
            className="w-full sm:w-auto"
          >
            {isPending ? "Checking..." : "Check availability"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Results */}
      {data && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Showing availability for{" "}
            <strong>{checkIn}</strong> to <strong>{checkOut}</strong>
          </p>

          {data.rooms.length === 0 && (
            <p className="text-sm text-muted-foreground">No rooms configured.</p>
          )}

          {data.rooms.map((room) => {
            const isCollapsed = collapsedRooms.has(room.id);
            return (
              <div
                key={room.id}
                className="border rounded-lg overflow-hidden"
              >
                {/* Room header */}
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted transition-colors text-left"
                  onClick={() => toggleRoom(room.id)}
                  aria-expanded={!isCollapsed}
                >
                  <span className="font-medium">
                    {room.name}
                    {room.floor && (
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        Floor {room.floor}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {isCollapsed ? "Show" : "Hide"}
                  </span>
                </button>

                {/* Bed list */}
                {!isCollapsed && (
                  <ul className="divide-y">
                    {room.beds.map((bed) => {
                      const status = getBedStatus(
                        bed.id,
                        checkIn,
                        checkOut,
                        data
                      );
                      return (
                        <li
                          key={bed.id}
                          className="flex items-center justify-between px-4 py-3"
                        >
                          <div>
                            <span className="text-sm font-medium">
                              {bed.label}
                            </span>
                            <span
                              className={`ml-3 text-xs ${statusClass[status]}`}
                            >
                              {statusLabel[status]}
                            </span>
                          </div>

                          {status === "available" && (
                            <Link
                              href={bookingUrl(bed.id)}
                              className={buttonVariants({
                                size: "sm",
                                variant: "outline",
                              })}
                            >
                              Book
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}

          {/* Color legend */}
          <div className="flex flex-wrap gap-4 pt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              Booked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              Held
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />
              Closed
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
