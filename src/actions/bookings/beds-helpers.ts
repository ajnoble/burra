type BedStatus = "available" | "booked" | "held" | "held-by-you";

export type BedWithStatus = {
  id: string;
  label: string;
  roomId: string;
  sortOrder: number;
  status: BedStatus;
};

export function buildBedAvailabilityMap(
  allBeds: { id: string; label: string; roomId: string; sortOrder: number }[],
  bookedBedIds: Set<string>,
  otherHeldBedIds: Set<string>,
  myHeldBedIds: Set<string> | null
): BedWithStatus[] {
  return allBeds.map((bed) => {
    let status: BedStatus = "available";
    if (bookedBedIds.has(bed.id)) {
      status = "booked";
    } else if (myHeldBedIds?.has(bed.id)) {
      status = "held-by-you";
    } else if (otherHeldBedIds.has(bed.id)) {
      status = "held";
    }
    return { id: bed.id, label: bed.label, roomId: bed.roomId, sortOrder: bed.sortOrder, status };
  });
}
