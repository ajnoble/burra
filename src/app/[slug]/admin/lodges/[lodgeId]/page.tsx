import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { db } from "@/db/index";
import { lodges, rooms, beds } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RoomManager } from "./room-manager";

export default async function LodgeDetailPage({
  params,
}: {
  params: Promise<{ slug: string; lodgeId: string }>;
}) {
  const { slug, lodgeId } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const [lodge] = await db
    .select()
    .from(lodges)
    .where(eq(lodges.id, lodgeId))
    .limit(1);

  if (!lodge || lodge.organisationId !== org.id) notFound();

  const lodgeRooms = await db
    .select()
    .from(rooms)
    .where(eq(rooms.lodgeId, lodge.id))
    .orderBy(rooms.sortOrder);

  // Get beds for all rooms
  const roomIds = lodgeRooms.map((r) => r.id);
  const allBeds =
    roomIds.length > 0
      ? await db.select().from(beds).orderBy(beds.sortOrder)
      : [];

  const bedsByRoom = new Map<string, typeof allBeds>();
  for (const bed of allBeds) {
    if (!roomIds.includes(bed.roomId)) continue;
    const existing = bedsByRoom.get(bed.roomId) ?? [];
    existing.push(bed);
    bedsByRoom.set(bed.roomId, existing);
  }

  const roomsWithBeds = lodgeRooms.map((room) => ({
    ...room,
    beds: bedsByRoom.get(room.id) ?? [],
  }));

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/${slug}/admin/lodges`} />}
        >
          &larr; Lodges
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{lodge.name}</h1>
          {lodge.address && (
            <p className="text-muted-foreground text-sm">{lodge.address}</p>
          )}
        </div>
        <Badge variant="outline" className="ml-auto">
          {lodge.totalBeds} beds total
        </Badge>
      </div>

      <RoomManager
        lodgeId={lodge.id}
        initialRooms={roomsWithBeds}
      />
    </div>
  );
}
