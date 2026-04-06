"use server";

import { db } from "@/db/index";
import {
  availabilityCache,
  lodges,
  seasons,
} from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getOverridesForLodge } from "./queries";

type RebuildInput = {
  lodgeId: string;
  totalBeds: number;
  startDate: string;
  endDate: string;
};

function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");

  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function computeEffectiveBeds(
  baseBeds: number,
  date: string,
  overrides: { startDate: string; endDate: string; type: string; bedReduction: number | null }[]
): number {
  let effective = baseBeds;

  for (const override of overrides) {
    if (date >= override.startDate && date <= override.endDate) {
      if (override.type === "CLOSURE") {
        return 0;
      }
      if (override.type === "REDUCTION" && override.bedReduction) {
        effective -= override.bedReduction;
      }
    }
  }

  return Math.max(0, effective);
}

export async function rebuildAvailabilityCache(input: RebuildInput) {
  const { lodgeId, totalBeds, startDate, endDate } = input;

  // Delete existing cache rows for this range
  await db
    .delete(availabilityCache)
    .where(
      and(
        eq(availabilityCache.lodgeId, lodgeId),
        gte(availabilityCache.date, startDate),
        lte(availabilityCache.date, endDate)
      )
    );

  const dates = generateDateRange(startDate, endDate);
  if (dates.length === 0) return;

  // Get overrides that overlap this date range
  const overrides = await getOverridesForLodge(lodgeId, startDate, endDate);

  // Build cache rows
  const rows = dates.map((date) => ({
    lodgeId,
    date,
    totalBeds: computeEffectiveBeds(totalBeds, date, overrides),
    bookedBeds: 0,
    version: 0,
  }));

  await db.insert(availabilityCache).values(rows);
}

export async function seedSeasonAvailability(
  seasonId: string,
  slug: string
) {
  // Look up season
  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId));

  if (!season) {
    return { success: false, error: "Season not found" };
  }

  // Get all active lodges for the org
  const orgLodges = await db
    .select({ id: lodges.id, totalBeds: lodges.totalBeds })
    .from(lodges)
    .where(
      and(
        eq(lodges.organisationId, season.organisationId),
        eq(lodges.isActive, true)
      )
    );

  // Rebuild cache for each lodge
  for (const lodge of orgLodges) {
    await rebuildAvailabilityCache({
      lodgeId: lodge.id,
      totalBeds: lodge.totalBeds,
      startDate: season.startDate,
      endDate: season.endDate,
    });
  }

  revalidatePath(`/${slug}/admin/availability`);
  return { success: true };
}
