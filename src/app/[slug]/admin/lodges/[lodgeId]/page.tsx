import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { db } from "@/db/index";
import { lodges, rooms, beds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "../../page-header";
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
      <PageHeader
        title={lodge.name}
        subtitle={lodge.address ?? undefined}
        backHref={`/${slug}/admin/lodges`}
        backLabel="Lodges"
        actions={
          <Badge variant="outline">{lodge.totalBeds} beds total</Badge>
        }
      />

      <RoomManager
        lodgeId={lodge.id}
        initialRooms={roomsWithBeds}
      />
    </div>
  );
}
