"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { reassignBeds } from "@/actions/bookings/reassign-beds";
import { toast } from "sonner";

type Guest = {
  id: string;
  firstName: string;
  lastName: string;
  bedId: string | null;
  bedLabel: string | null;
  roomId: string | null;
  roomName: string | null;
};

type AvailableBed = { bedId: string; bedLabel: string };
type AvailableRoom = { roomId: string; roomName: string; beds: AvailableBed[] };

type Props = {
  bookingId: string;
  organisationId: string;
  guests: Guest[];
  availableBeds: AvailableRoom[];
  slug: string;
};

type Assignment = { roomId: string; bedId: string };

export function ReassignBedsForm({
  bookingId,
  organisationId,
  guests,
  availableBeds,
  slug,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Track per-guest assignments: guestId -> { roomId, bedId }
  const [assignments, setAssignments] = useState<Record<string, Assignment>>(
    () => {
      const initial: Record<string, Assignment> = {};
      for (const g of guests) {
        initial[g.id] = { roomId: g.roomId ?? "", bedId: g.bedId ?? "" };
      }
      return initial;
    }
  );

  function handleRoomChange(guestId: string, roomId: string) {
    setAssignments((prev) => ({
      ...prev,
      [guestId]: { roomId, bedId: "" },
    }));
  }

  function handleBedChange(guestId: string, bedId: string) {
    setAssignments((prev) => ({
      ...prev,
      [guestId]: { ...prev[guestId], bedId },
    }));
  }

  function getBedsForRoom(roomId: string): AvailableBed[] {
    return availableBeds.find((r) => r.roomId === roomId)?.beds ?? [];
  }

  async function handleSave() {
    setSaving(true);
    try {
      const assignmentList = guests
        .map((g) => {
          const a = assignments[g.id];
          return a?.bedId ? { bookingGuestId: g.id, bedId: a.bedId } : null;
        })
        .filter((a): a is { bookingGuestId: string; bedId: string } => a !== null);

      const result = await reassignBeds({
        bookingId,
        organisationId,
        assignments: assignmentList,
        slug,
      });

      if (result.success) {
        toast.success("Beds reassigned");
        setEditing(false);
      } else {
        toast.error(result.error ?? "Failed to reassign beds");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reassign beds");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="rounded-lg border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Bed Assignments</h3>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Reassign Beds
          </Button>
        </div>
        <div className="space-y-1">
          {guests.map((g) => (
            <div key={g.id} className="text-sm flex justify-between">
              <span>
                {g.firstName} {g.lastName}
              </span>
              <span className="text-muted-foreground">
                {g.roomName && g.bedLabel
                  ? `${g.roomName} · ${g.bedLabel}`
                  : "Unassigned"}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <h3 className="font-semibold">Reassign Beds</h3>
      {guests.map((g) => {
        const current = assignments[g.id] ?? { roomId: "", bedId: "" };
        const bedsInRoom = getBedsForRoom(current.roomId);

        return (
          <div key={g.id} className="space-y-2">
            <p className="text-sm font-medium">
              {g.firstName} {g.lastName}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Room</Label>
                <select
                  value={current.roomId}
                  onChange={(e) => handleRoomChange(g.id, e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Select room</option>
                  {availableBeds.map((room) => (
                    <option key={room.roomId} value={room.roomId}>
                      {room.roomName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bed</Label>
                <select
                  value={current.bedId}
                  onChange={(e) => handleBedChange(g.id, e.target.value)}
                  disabled={!current.roomId}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                >
                  <option value="">Select bed</option>
                  {bedsInRoom.map((bed) => (
                    <option key={bed.bedId} value={bed.bedId}>
                      {bed.bedLabel}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Assignments"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditing(false)}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
