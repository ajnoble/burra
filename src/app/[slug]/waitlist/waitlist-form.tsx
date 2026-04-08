"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { joinWaitlist } from "@/actions/waitlist/join";

type Lodge = {
  id: string;
  name: string;
};

type BookingRound = {
  id: string;
  name: string;
  seasonId: string;
};

type Props = {
  organisationId: string;
  slug: string;
  lodges: Lodge[];
  bookingRounds: BookingRound[];
  initialLodgeId?: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
};

export function WaitlistForm({
  organisationId,
  slug,
  lodges,
  bookingRounds,
  initialLodgeId,
  initialCheckIn,
  initialCheckOut,
}: Props) {
  const [lodgeId, setLodgeId] = useState(
    initialLodgeId ?? lodges[0]?.id ?? ""
  );
  const [checkIn, setCheckIn] = useState(initialCheckIn ?? "");
  const [checkOut, setCheckOut] = useState(initialCheckOut ?? "");
  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [bookingRoundId, setBookingRoundId] = useState(
    bookingRounds.length === 1 ? bookingRounds[0].id : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!lodgeId) {
      setError("Please select a lodge.");
      return;
    }
    if (!bookingRoundId) {
      setError("Please select a booking round.");
      return;
    }
    if (!checkIn || !checkOut) {
      setError("Please enter check-in and check-out dates.");
      return;
    }
    if (checkOut <= checkIn) {
      setError("Check-out date must be after check-in date.");
      return;
    }
    if (numberOfGuests < 1) {
      setError("Number of guests must be at least 1.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await joinWaitlist({
        organisationId,
        lodgeId,
        bookingRoundId,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        numberOfGuests,
        slug,
      });

      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error ?? "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="rounded-lg border border-green-500/50 bg-green-50 dark:bg-green-950/20 p-4">
            <h2 className="text-lg font-semibold text-green-700 dark:text-green-400 mb-1">
              You&apos;re on the waitlist!
            </h2>
            <p className="text-sm text-green-700 dark:text-green-400">
              We&apos;ll notify you by email if a spot becomes available for
              your requested dates. You can also view your waitlist status on
              your dashboard.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join the Waitlist</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Lodge */}
          <div className="space-y-2">
            <Label htmlFor="lodge">Lodge</Label>
            {lodges.length === 1 ? (
              <div className="rounded-md border px-3 py-2 text-sm bg-muted">
                {lodges[0].name}
              </div>
            ) : (
              <Select value={lodgeId} onValueChange={(v) => v && setLodgeId(v)}>
                <SelectTrigger id="lodge">
                  <SelectValue placeholder="Select a lodge" />
                </SelectTrigger>
                <SelectContent>
                  {lodges.map((lodge) => (
                    <SelectItem key={lodge.id} value={lodge.id}>
                      {lodge.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Booking Round */}
          {bookingRounds.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="round">Booking Round</Label>
              {bookingRounds.length === 1 ? (
                <div className="rounded-md border px-3 py-2 text-sm bg-muted">
                  {bookingRounds[0].name}
                </div>
              ) : (
                <Select
                  value={bookingRoundId}
                  onValueChange={(v) => v && setBookingRoundId(v)}
                >
                  <SelectTrigger id="round">
                    <SelectValue placeholder="Select a booking round" />
                  </SelectTrigger>
                  <SelectContent>
                    {bookingRounds.map((round) => (
                      <SelectItem key={round.id} value={round.id}>
                        {round.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Check-in */}
          <div className="space-y-2">
            <Label htmlFor="checkIn">Check-in Date</Label>
            <Input
              id="checkIn"
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              required
            />
          </div>

          {/* Check-out */}
          <div className="space-y-2">
            <Label htmlFor="checkOut">Check-out Date</Label>
            <Input
              id="checkOut"
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              min={checkIn || undefined}
              required
            />
          </div>

          {/* Number of Guests */}
          <div className="space-y-2">
            <Label htmlFor="guests">Number of Guests</Label>
            <Input
              id="guests"
              type="number"
              min={1}
              max={99}
              value={numberOfGuests}
              onChange={(e) =>
                setNumberOfGuests(Math.max(1, parseInt(e.target.value, 10) || 1))
              }
              required
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Joining waitlist..." : "Join Waitlist"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
