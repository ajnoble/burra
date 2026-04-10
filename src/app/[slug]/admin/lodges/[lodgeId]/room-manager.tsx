"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createRoom, deleteRoom, updatePortaCotCount } from "@/actions/lodges";
import { toast } from "sonner";

type Bed = {
  id: string;
  roomId: string;
  label: string;
  sortOrder: number;
};

type Room = {
  id: string;
  lodgeId: string;
  name: string;
  floor: string | null;
  capacity: number;
  description: string | null;
  sortOrder: number;
  beds: Bed[];
};

export function RoomManager({
  lodgeId,
  organisationId,
  portaCotCount: initialPortaCotCount,
  initialRooms,
}: {
  lodgeId: string;
  organisationId: string;
  portaCotCount: number;
  initialRooms: Room[];
}) {
  const params = useParams();
  const slug = params.slug as string;
  const [roomsList, setRooms] = useState(initialRooms);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [portaCotCount, setPortaCotCount] = useState(initialPortaCotCount);
  const [portaCotSaving, setPortaCotSaving] = useState(false);

  async function handlePortaCotBlur(e: React.FocusEvent<HTMLInputElement>) {
    const value = parseInt(e.currentTarget.value, 10);
    const count = isNaN(value) || value < 0 ? 0 : value;
    if (count === initialPortaCotCount) return;
    setPortaCotSaving(true);
    try {
      await updatePortaCotCount({ id: lodgeId, organisationId, portaCotCount: count, slug });
      toast.success("Port-a-cot count updated");
    } catch {
      toast.error("Failed to update port-a-cot count");
    } finally {
      setPortaCotSaving(false);
    }
  }

  async function handleCreateRoom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);

    try {
      await createRoom({
        lodgeId,
        name: form.get("name") as string,
        floor: form.get("floor") as string,
        capacity: parseInt(form.get("capacity") as string, 10),
        description: form.get("description") as string,
        sortOrder: roomsList.length,
        slug,
      });
      toast.success("Room created with beds");
      setDialogOpen(false);
      // Reload to get fresh data including auto-created beds
      window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create room"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRoom(roomId: string, roomName: string) {
    if (
      !confirm(
        `Delete "${roomName}" and all its beds? This cannot be undone.`
      )
    )
      return;

    try {
      await deleteRoom(roomId, slug);
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
      toast.success("Room deleted");
    } catch {
      toast.error("Failed to delete room");
    }
  }

  const totalBeds = roomsList.reduce((sum, r) => sum + r.beds.length, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Port-a-Cot Availability</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Label htmlFor="porta-cot-count" className="shrink-0">
              Number of port-a-cots available
            </Label>
            <Input
              id="porta-cot-count"
              type="number"
              min={0}
              className="w-24"
              value={portaCotCount}
              disabled={portaCotSaving}
              onChange={(e) => setPortaCotCount(parseInt(e.target.value, 10) || 0)}
              onBlur={handlePortaCotBlur}
            />
            {portaCotSaving && (
              <span className="text-xs text-muted-foreground">Saving...</span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {roomsList.length} rooms, {totalBeds} beds
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button />}>Add Room</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Room</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="room-name">Room Name</Label>
                <Input
                  id="room-name"
                  name="name"
                  placeholder="e.g. Room 1 - Bunkroom"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="room-floor">Floor (optional)</Label>
                <Input
                  id="room-floor"
                  name="floor"
                  placeholder="e.g. Ground, First"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="room-capacity">
                  Number of Beds
                </Label>
                <Input
                  id="room-capacity"
                  name="capacity"
                  type="number"
                  min={1}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Beds will be auto-created for this room.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="room-desc">Description (optional)</Label>
                <Input id="room-desc" name="description" />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create Room"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {roomsList.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No rooms yet. Add rooms to set up the lodge layout.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {roomsList.map((room) => (
            <Card key={room.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{room.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    {room.floor && (
                      <Badge variant="outline" className="text-xs">
                        {room.floor}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {room.beds.length} / {room.capacity} beds
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDeleteRoom(room.id, room.name)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {room.beds.map((bed) => (
                    <div
                      key={bed.id}
                      className="rounded-md border px-3 py-1.5 text-xs bg-muted/50"
                    >
                      {bed.label}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
