"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { modifyBookingDates } from "@/actions/bookings/modify-dates";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";

type Props = {
  bookingId: string;
  organisationId: string;
  currentCheckIn: string;
  currentCheckOut: string;
  slug: string;
};

export function ModifyDatesForm({
  bookingId,
  organisationId,
  currentCheckIn,
  currentCheckOut,
  slug,
}: Props) {
  const [newCheckIn, setNewCheckIn] = useState(currentCheckIn);
  const [newCheckOut, setNewCheckOut] = useState(currentCheckOut);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await modifyBookingDates({
        bookingId,
        organisationId,
        newCheckInDate: newCheckIn,
        newCheckOutDate: newCheckOut,
        slug,
      });
      if (result.success) {
        const newTotal =
          result.newTotalAmountCents !== undefined
            ? ` New total: ${formatCurrency(result.newTotalAmountCents)}`
            : "";
        toast.success(`Dates updated.${newTotal}`);
      } else {
        toast.error(result.error ?? "Failed to update dates");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update dates");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h3 className="font-semibold">Modify Dates</h3>
      <p className="text-sm text-muted-foreground">
        Current: {currentCheckIn} to {currentCheckOut}
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="new-check-in">New Check-in</Label>
            <input
              id="new-check-in"
              type="date"
              value={newCheckIn}
              onChange={(e) => setNewCheckIn(e.target.value)}
              required
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-check-out">New Check-out</Label>
            <input
              id="new-check-out"
              type="date"
              value={newCheckOut}
              onChange={(e) => setNewCheckOut(e.target.value)}
              required
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>
        <Button type="submit" disabled={saving} size="sm">
          {saving ? "Updating..." : "Update Dates"}
        </Button>
      </form>
    </div>
  );
}
