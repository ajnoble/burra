import { db } from "@/db/index";
import { availabilityCache, availabilityOverrides } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

export async function getMonthAvailability(
  lodgeId: string,
  year: number,
  month: number
) {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  return db
    .select()
    .from(availabilityCache)
    .where(
      and(
        eq(availabilityCache.lodgeId, lodgeId),
        gte(availabilityCache.date, startDate),
        lte(availabilityCache.date, endDate)
      )
    )
    .orderBy(availabilityCache.date);
}

export async function getDateRangeAvailability(
  lodgeId: string,
  startDate: string,
  endDate: string
) {
  return db
    .select()
    .from(availabilityCache)
    .where(
      and(
        eq(availabilityCache.lodgeId, lodgeId),
        gte(availabilityCache.date, startDate),
        lte(availabilityCache.date, endDate)
      )
    )
    .orderBy(availabilityCache.date);
}

export async function getOverridesForLodge(
  lodgeId: string,
  startDate?: string,
  endDate?: string
) {
  const conditions = [eq(availabilityOverrides.lodgeId, lodgeId)];

  if (startDate && endDate) {
    conditions.push(lte(availabilityOverrides.startDate, endDate));
    conditions.push(gte(availabilityOverrides.endDate, startDate));
  }

  return db
    .select()
    .from(availabilityOverrides)
    .where(and(...conditions))
    .orderBy(availabilityOverrides.startDate);
}
