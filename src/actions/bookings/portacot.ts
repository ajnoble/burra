import { db } from "@/db/index";
import { lodges, bookings, bookingGuests } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export type PortaCotAvailability = {
  total: number;
  booked: number;
  available: number;
};

export async function getPortaCotAvailability(
  lodgeId: string,
  checkInDate: string,
  checkOutDate: string
): Promise<PortaCotAvailability> {
  const [lodge] = await db
    .select({ portaCotCount: lodges.portaCotCount })
    .from(lodges)
    .where(eq(lodges.id, lodgeId));

  if (!lodge) return { total: 0, booked: 0, available: 0 };

  const result = await db.execute(
    sql`SELECT COUNT(*)::int AS booked_cots
        FROM booking_guests bg
        JOIN bookings b ON b.id = bg.booking_id
        WHERE b.lodge_id = ${lodgeId}
        AND b.status NOT IN ('CANCELLED')
        AND b.check_in_date < ${checkOutDate}
        AND b.check_out_date > ${checkInDate}
        AND bg.porta_cot_requested = true`
  );

  // drizzle-orm/node-postgres returns rows as an array; pglite wraps them in { rows: [...] }
  const rows =
    (result as unknown as { rows?: { booked_cots: number }[] }).rows ??
    (result as unknown as { booked_cots: number }[]);
  const bookedCots = rows[0]?.booked_cots ?? 0;

  return {
    total: lodge.portaCotCount,
    booked: bookedCots,
    available: Math.max(0, lodge.portaCotCount - bookedCots),
  };
}
