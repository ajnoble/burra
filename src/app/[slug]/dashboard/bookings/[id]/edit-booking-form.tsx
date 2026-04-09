"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { memberEditBooking } from "@/actions/bookings/member-edit";
import { createCheckoutSession } from "@/actions/stripe/checkout";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import type { BookingDetailForEdit } from "@/actions/bookings/queries";

type RoomWithBeds = {
  id: string;
  name: string;
  floor: string | null;
  capacity: number;
  sortOrder: number;
  beds: {
    id: string;
    label: string;
    roomId: string;
    sortOrder: number;
    status: "available" | "booked" | "held" | "held-by-you";
  }[];
};

type Props = {
  booking: BookingDetailForEdit;
  organisationId: string;
  slug: string;
  availableBeds: RoomWithBeds[];
  orgMembers: { id: string; firstName: string; lastName: string }[];
  stripeConnected: boolean;
};

export function EditBookingForm({
  booking,
  organisationId,
  slug,
  availableBeds,
  orgMembers,
  stripeConnected,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [checkInDate, setCheckInDate] = useState(booking.checkInDate);
  const [checkOutDate, setCheckOutDate] = useState(booking.checkOutDate);
  const [guestMemberIds, setGuestMemberIds] = useState<string[]>(
    booking.guests.map((g) => g.memberId)
  );
  const [bedAssignments, setBedAssignments] = useState<
    Record<string, string>
  >(
    Object.fromEntries(
      booking.guests
        .filter((g) => g.bedId)
        .map((g) => [g.memberId, g.bedId!])
    )
  );
  const [addGuestId, setAddGuestId] = useState("");

  const hasChanges =
    checkInDate !== booking.checkInDate ||
    checkOutDate !== booking.checkOutDate ||
    JSON.stringify([...guestMemberIds].sort()) !==
      JSON.stringify([...booking.guests.map((g) => g.memberId)].sort()) ||
    JSON.stringify(bedAssignments) !==
      JSON.stringify(
        Object.fromEntries(
          booking.guests
            .filter((g) => g.bedId)
            .map((g) => [g.memberId, g.bedId!])
        )
      );

  const availableToAdd = orgMembers.filter(
    (m) => !guestMemberIds.includes(m.id)
  );

  function handleAddGuest() {
    if (addGuestId && !guestMemberIds.includes(addGuestId)) {
      setGuestMemberIds([...guestMemberIds, addGuestId]);
      setAddGuestId("");
    }
  }

  function handleRemoveGuest(memberId: string) {
    if (memberId === booking.primaryMemberId) return;
    setGuestMemberIds(guestMemberIds.filter((id) => id !== memberId));
    const { [memberId]: _, ...rest } = bedAssignments;
    setBedAssignments(rest);
  }

  function handleBedChange(memberId: string, bedId: string) {
    setBedAssignments({ ...bedAssignments, [memberId]: bedId });
  }

  // Flatten available beds for the select
  const allAvailableBeds = availableBeds.flatMap((room) =>
    room.beds
      .filter((b) => b.status === "available" || b.status === "held-by-you")
      .map((b) => ({
        bedId: b.id,
        label: `${room.name} — ${b.label}`,
      }))
  );

  // Include currently assigned beds as options
  const currentBeds = booking.guests
    .filter((g) => g.bedId)
    .map((g) => ({
      bedId: g.bedId!,
      label: `${g.roomName ?? "Room"} — ${g.bedLabel ?? "Bed"}`,
    }));

  const allBedOptions = [
    ...currentBeds,
    ...allAvailableBeds.filter(
      (b) => !currentBeds.some((cb) => cb.bedId === b.bedId)
    ),
  ];

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const newBedAssignments = Object.entries(bedAssignments).map(
        ([guestMemberId, bedId]) => ({ guestMemberId, bedId })
      );

      const result = await memberEditBooking({
        bookingId: booking.id,
        organisationId,
        slug,
        ...(checkInDate !== booking.checkInDate && {
          newCheckInDate: checkInDate,
        }),
        ...(checkOutDate !== booking.checkOutDate && {
          newCheckOutDate: checkOutDate,
        }),
        ...(JSON.stringify([...guestMemberIds].sort()) !==
          JSON.stringify(
            [...booking.guests.map((g) => g.memberId)].sort()
          ) && { newGuestMemberIds: guestMemberIds }),
        ...(newBedAssignments.length > 0 && { newBedAssignments }),
      });

      if (!result.success) {
        toast.error(result.error ?? "Failed to update booking");
        return;
      }

      if (result.topUpTransactionId && stripeConnected) {
        toast.success(
          `Booking updated. Additional payment of ${formatCurrency(result.priceDeltaCents ?? 0)} required.`
        );
        const checkout = await createCheckoutSession(
          organisationId,
          result.topUpTransactionId,
          slug
        );
        if (checkout.url) {
          window.location.href = checkout.url;
          return;
        }
      }

      if (result.requiresApproval) {
        toast.success("Changes saved and pending admin approval.");
      } else if (result.priceDeltaCents && result.priceDeltaCents < 0) {
        toast.success(
          `Booking updated. A refund of ${formatCurrency(Math.abs(result.priceDeltaCents))} will be issued.`
        );
      } else {
        toast.success("Booking updated successfully.");
      }

      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update booking"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <Button onClick={() => setEditing(true)} variant="outline">
        Edit Booking
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit Booking</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Dates */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Dates</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="edit-checkin">Check-in</Label>
              <Input
                id="edit-checkin"
                type="date"
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-checkout">Check-out</Label>
              <Input
                id="edit-checkout"
                type="date"
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Guests */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Guests</h4>
          <div className="space-y-2">
            {guestMemberIds.map((memberId) => {
              const existingGuest = booking.guests.find(
                (g) => g.memberId === memberId
              );
              const memberInfo =
                existingGuest ??
                orgMembers.find((m) => m.id === memberId);
              const isPrimary = memberId === booking.primaryMemberId;

              return (
                <div
                  key={memberId}
                  className="flex items-center justify-between rounded-lg border p-2"
                >
                  <span className="text-sm">
                    {memberInfo
                      ? `${memberInfo.firstName} ${memberInfo.lastName}`
                      : memberId}
                    {isPrimary && (
                      <span className="text-xs text-muted-foreground ml-1">
                        (primary)
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <Select
                      value={bedAssignments[memberId] ?? ""}
                      onValueChange={(v) => handleBedChange(memberId, v)}
                    >
                      <SelectTrigger className="w-48 h-8 text-xs">
                        <SelectValue placeholder="Select bed..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allBedOptions.map((bed) => (
                          <SelectItem key={bed.bedId} value={bed.bedId}>
                            {bed.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!isPrimary && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveGuest(memberId)}
                        className="text-destructive text-xs"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {availableToAdd.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={addGuestId} onValueChange={setAddGuestId}>
                <SelectTrigger className="w-64 h-8 text-xs">
                  <SelectValue placeholder="Add a guest..." />
                </SelectTrigger>
                <SelectContent>
                  {availableToAdd.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.firstName} {m.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddGuest}
                disabled={!addGuestId}
              >
                Add
              </Button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => {
              setEditing(false);
              setCheckInDate(booking.checkInDate);
              setCheckOutDate(booking.checkOutDate);
              setGuestMemberIds(booking.guests.map((g) => g.memberId));
              setBedAssignments(
                Object.fromEntries(
                  booking.guests
                    .filter((g) => g.bedId)
                    .map((g) => [g.memberId, g.bedId!])
                )
              );
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !hasChanges}
          >
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
