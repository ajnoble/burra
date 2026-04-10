"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useBooking, guestKey } from "../booking-context";
import { getBookableMembers } from "@/actions/bookings/members";
import { getMyAssociates } from "@/actions/associates";
import { getPortaCotAvailability } from "@/actions/bookings/portacot";
import { AddAssociateForm } from "./add-associate-form";

type Props = {
  organisationId: string;
  memberId: string;
  memberName: string;
  membershipClassId: string;
  slug: string;
};

type MemberOption = {
  id: string;
  firstName: string;
  lastName: string;
  primaryMemberId: string | null;
  membershipClassName: string;
};

type AssociateOption = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

type Tab = "members" | "associates";

export function AddGuests({
  organisationId,
  memberId,
  memberName,
  membershipClassId,
  slug,
}: Props) {
  const booking = useBooking();
  const [activeTab, setActiveTab] = useState<Tab>("members");
  const [allMembers, setAllMembers] = useState<MemberOption[]>([]);
  const [associates, setAssociates] = useState<AssociateOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [cotAvailability, setCotAvailability] = useState<{
    total: number;
    available: number;
  } | null>(null);

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

  // Load bookable members and update primary member class name
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

  // Load associates
  useEffect(() => {
    async function load() {
      try {
        const result = await getMyAssociates(organisationId, memberId);
        setAssociates(result);
      } catch {
        // silently ignore — associates tab will show empty
      }
    }
    load();
  }, [organisationId, memberId]);

  // Load port-a-cot availability
  useEffect(() => {
    async function load() {
      if (!booking.lodgeId || !booking.checkInDate || !booking.checkOutDate) return;
      try {
        const avail = await getPortaCotAvailability(
          booking.lodgeId,
          booking.checkInDate,
          booking.checkOutDate
        );
        setCotAvailability({ total: avail.total, available: avail.available });
      } catch {
        // silently ignore
      }
    }
    load();
  }, [booking.lodgeId, booking.checkInDate, booking.checkOutDate]);

  const selectedKeys = new Set(booking.guests.map(guestKey));

  // Count cots already requested
  const cotsRequested = booking.guests.filter((g) => g.portaCotRequested).length;
  const cotsRemaining = cotAvailability
    ? cotAvailability.available - cotsRequested
    : 0;

  // Members tab: filter out already-added guests
  const filteredMembers = allMembers.filter((m) => {
    if (selectedKeys.has(m.id)) return false;
    if (!search) return true;
    const name = `${m.firstName} ${m.lastName}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  // Associates tab: filter out already-added guests
  const filteredAssociates = associates.filter((a) => {
    if (selectedKeys.has(a.id)) return false;
    if (!search) return true;
    const name = `${a.firstName} ${a.lastName}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  function handleAddMember(member: MemberOption) {
    booking.addGuest({
      memberId: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      membershipClassName: member.membershipClassName,
    });
    setSearch("");
  }

  function handleAddAssociate(associate: AssociateOption) {
    booking.addGuest({
      associateId: associate.id,
      firstName: associate.firstName,
      lastName: associate.lastName,
      membershipClassName: "Guest",
    });
    setSearch("");
  }

  function handleRemoveGuest(key: string) {
    if (key === memberId) return; // Cannot remove primary
    booking.removeGuest(key);
  }

  function handleToggleCot(key: string) {
    const guest = booking.guests.find((g) => guestKey(g) === key);
    if (!guest) return;

    const currentlyOn = guest.portaCotRequested ?? false;
    // If turning on, check availability
    if (!currentlyOn && cotsRemaining <= 0) return;

    booking.setGuests(
      booking.guests.map((g) =>
        guestKey(g) === key
          ? { ...g, portaCotRequested: !currentlyOn }
          : g
      )
    );
  }

  function handleAssociateAdded(id: string, firstName: string, lastName: string) {
    // Add to local list and immediately add as guest
    const newAssociate = { id, firstName, lastName, email: "" };
    setAssociates((prev) => [...prev, newAssociate]);
    booking.addGuest({
      associateId: id,
      firstName,
      lastName,
      membershipClassName: "Guest",
    });
    setShowAddForm(false);
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
          {booking.guests.map((guest) => {
            const key = guestKey(guest);
            const isPrimary = key === memberId;
            const isAssociate = !!guest.associateId;

            return (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium">
                      {guest.firstName} {guest.lastName}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {isAssociate ? (
                        <Badge variant="secondary" className="text-xs">
                          Guest
                        </Badge>
                      ) : guest.membershipClassName ? (
                        <Badge variant="secondary" className="text-xs">
                          {guest.membershipClassName}
                        </Badge>
                      ) : null}
                      {guest.portaCotRequested && (
                        <Badge variant="outline" className="text-xs">
                          Port-a-cot
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Cot toggle — for all except primary */}
                  {!isPrimary && cotAvailability && cotAvailability.total > 0 && (
                    <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={guest.portaCotRequested ?? false}
                        disabled={
                          !guest.portaCotRequested && cotsRemaining <= 0
                        }
                        onChange={() => handleToggleCot(key)}
                        className="rounded"
                      />
                      Cot
                    </label>
                  )}

                  {isPrimary ? (
                    <Badge>Primary</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveGuest(key)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Port-a-cot availability */}
        {cotAvailability && cotAvailability.total > 0 && (
          <p className="text-xs text-muted-foreground mb-3">
            Port-a-cots:{" "}
            <span className="font-medium">
              {Math.max(0, cotsRemaining)} of {cotAvailability.total} available
            </span>
          </p>
        )}

        {/* Tab toggle */}
        <div className="flex rounded-lg border overflow-hidden mb-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab("members");
              setSearch("");
              setShowAddForm(false);
            }}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === "members"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted/50"
            }`}
          >
            Members
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("associates");
              setSearch("");
            }}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === "associates"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted/50"
            }`}
          >
            My Associates
          </button>
        </div>

        {/* Search and add */}
        {activeTab === "members" && (
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
                        onClick={() => handleAddMember(member)}
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
        )}

        {activeTab === "associates" && (
          <div className="space-y-2">
            {!showAddForm && (
              <>
                <Input
                  placeholder="Search associates to add..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mb-2"
                />

                {search.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border">
                    {filteredAssociates.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">
                        No matching associates found.
                      </p>
                    ) : (
                      filteredAssociates.slice(0, 10).map((assoc) => (
                        <button
                          key={assoc.id}
                          type="button"
                          className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 border-b last:border-b-0"
                          onClick={() => handleAddAssociate(assoc)}
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {assoc.firstName} {assoc.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">Guest</p>
                          </div>
                          <span className="text-xs text-primary">+ Add</span>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {search.length === 0 && associates.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border">
                    {associates
                      .filter((a) => !selectedKeys.has(a.id))
                      .map((assoc) => (
                        <button
                          key={assoc.id}
                          type="button"
                          className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 border-b last:border-b-0"
                          onClick={() => handleAddAssociate(assoc)}
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {assoc.firstName} {assoc.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">Guest</p>
                          </div>
                          <span className="text-xs text-primary">+ Add</span>
                        </button>
                      ))}
                    {associates.every((a) => selectedKeys.has(a.id)) && (
                      <p className="p-3 text-sm text-muted-foreground">
                        All your associates have been added.
                      </p>
                    )}
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowAddForm(true)}
                >
                  + Add New Associate
                </Button>
              </>
            )}

            {showAddForm && (
              <AddAssociateForm
                organisationId={organisationId}
                slug={slug}
                onAdded={handleAssociateAdded}
                onCancel={() => setShowAddForm(false)}
              />
            )}
          </div>
        )}
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
