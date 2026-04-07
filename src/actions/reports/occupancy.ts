"use server";

import { db } from "@/db/index";
import { availabilityCache, lodges } from "@/db/schema";
import { and, eq, gte, lte, SQL } from "drizzle-orm";

export type OccupancyFilters = {
  organisationId: string;
  dateFrom: string;
  dateTo: string;
  lodgeId?: string;
  page?: number;
};

export type OccupancyRow = {
  date: string;
  lodgeName: string;
  totalBeds: number;
  bookedBeds: number;
  availableBeds: number;
  occupancyPercent: number;
};

export type OccupancyResult = {
  rows: OccupancyRow[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 50;

export async function getOccupancyReport(
  filters: OccupancyFilters
): Promise<OccupancyResult> {
  const { organisationId, dateFrom, dateTo, lodgeId, page: pageParam } = filters;
  const page = pageParam ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions: SQL[] = [
    eq(lodges.organisationId, organisationId),
    gte(availabilityCache.date, dateFrom),
    lte(availabilityCache.date, dateTo),
  ];

  if (lodgeId) {
    conditions.push(eq(availabilityCache.lodgeId, lodgeId));
  }

  const rawRows = await db
    .select({
      date: availabilityCache.date,
      lodgeName: lodges.name,
      totalBeds: availabilityCache.totalBeds,
      bookedBeds: availabilityCache.bookedBeds,
    })
    .from(availabilityCache)
    .innerJoin(lodges, eq(availabilityCache.lodgeId, lodges.id))
    .where(and(...conditions))
    .orderBy(availabilityCache.date)
    .limit(PAGE_SIZE)
    .offset(offset);

  const rows: OccupancyRow[] = (
    rawRows as Array<{
      date: string;
      lodgeName: string;
      totalBeds: number;
      bookedBeds: number;
    }>
  ).map((row) => {
    const totalBeds = Number(row.totalBeds);
    const bookedBeds = Number(row.bookedBeds);
    const availableBeds = totalBeds - bookedBeds;
    const occupancyPercent =
      totalBeds > 0 ? Math.round((bookedBeds / totalBeds) * 100) : 0;

    return {
      date: row.date,
      lodgeName: row.lodgeName,
      totalBeds,
      bookedBeds,
      availableBeds,
      occupancyPercent,
    };
  });

  return {
    rows,
    total: rows.length,
    page,
    pageSize: PAGE_SIZE,
  };
}
