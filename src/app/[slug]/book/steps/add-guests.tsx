"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useBooking } from "../booking-context";
import { getBookableMembers } from "@/actions/bookings/members";

type Props = {
  organisationId: string;
  memberId: string;
  memberName: string;
  membershipClassId: string;
};

type MemberOption = {
  id: string;
  firstName: string;
  lastName: string;
  primaryMemberId: string | null;
  membershipClassName: string;
};

export function AddGuests({
  organisationId,
  memberId,
  memberName,
  membershipClassId,
}: Props) {
  const booking = useBooking();
  const [allMembers, setAllMembers] = useState<MemberOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Auto-add primary member on first load
  useEffect(() => {
    if (booking.guests.length === 0) {
      const [firstName, ...rest] = memberName.split(" ");
      booking.setGuests([
        {
          memberId,
          firstName,
          lastName: rest.join(" "),
          membershipClassName: "",
        },
      ]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load bookable members
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const members = await getBookableMembers(organisationId, memberId);
        setAllMembers(members);

        // Update primary member's class name if we have it
        const primary = members.find((m) => m.id === memberId);
        if (primary && booking.guests.length > 0) {
          booking.setGuests(
            booking.guests.map((g) =>
              g.memberId === memberId
                ? { ...g, membershipClassName: primary.membershipClassName }
                : g
            )
          );
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [organisationId, memberId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedIds = new Set(booking.guests.map((g) => g.memberId));

  const filteredMembers = allMembers.filter((m) => {
    if (selectedIds.has(m.id)) return false;
    if (!search) return true;
    const name = `${m.firstName} ${m.lastName}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  function handleAddGuest(member: MemberOption) {
    booking.addGuest({
      memberId: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      membershipClassName: member.membershipClassName,
    });
    setSearch("");
  }

  function handleRemoveGuest(guestMemberId: string) {
    if (guestMemberId === memberId) return; // Cannot remove primary
    booking.removeGuest(guestMemberId);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Guests</h2>
        <p className="text-sm text-muted-foreground mb-4">
          You are automatically included. Add additional guests below.
        </p>

        {/* Guest list */}
        <div className="space-y-2 mb-4">
          {booking.guests.map((guest) => (
            <div
              key={guest.memberId}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-medium">
                    {guest.firstName} {guest.lastName}
                  </p>
                  {guest.membershipClassName && (
                    <Badge variant="secondary" className="text-xs mt-0.5">
                      {guest.membershipClassName}
                    </Badge>
                  )}
                </div>
              </div>
              {guest.memberId === memberId ? (
                <Badge>Primary</Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoveGuest(guest.memberId)}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Search and add */}
        <div>
          <Input
            placeholder="Search members to add..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2"
          />

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading members...</p>
          ) : (
            search.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border">
                {filteredMembers.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    No matching members found.
                  </p>
                ) : (
                  filteredMembers.slice(0, 10).map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 border-b last:border-b-0"
                      onClick={() => handleAddGuest(member)}
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {member.firstName} {member.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.membershipClassName}
                        </p>
                      </div>
                      <span className="text-xs text-primary">+ Add</span>
                    </button>
                  ))
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* Booking info banner */}
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p>
          <span className="font-medium">{booking.lodgeName}</span> &middot;{" "}
          {booking.checkInDate} to {booking.checkOutDate}
        </p>
      </div>

      {/* Error */}
      {booking.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{booking.error}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => booking.goToStep(1)}>
          Back
        </Button>
        <Button
          onClick={() => booking.goToStep(3)}
          disabled={booking.guests.length === 0}
        >
          Next: Select Beds
        </Button>
      </div>
    </div>
  );
}
