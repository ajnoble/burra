import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { db } from "@/db/index";
import { lodges } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getMonthAvailability, getOverridesForLodge } from "@/actions/availability/queries";
import { AdminAvailabilityClient } from "./admin-availability-client";

export default async function AdminAvailabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const orgLodges = await db
    .select({ id: lodges.id, name: lodges.name, totalBeds: lodges.totalBeds })
    .from(lodges)
    .where(and(eq(lodges.organisationId, org.id), eq(lodges.isActive, true)));

  if (orgLodges.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Availability</h1>
        <p className="text-muted-foreground">
          No active lodges found. Create a lodge first.
        </p>
      </div>
    );
  }

  const selectedLodgeId =
    typeof sp.lodge === "string" ? sp.lodge : orgLodges[0].id;

  const now = new Date();
  const year =
    typeof sp.year === "string" ? parseInt(sp.year, 10) : now.getFullYear();
  const month =
    typeof sp.month === "string" ? parseInt(sp.month, 10) : now.getMonth() + 1;

  const availability = await getMonthAvailability(selectedLodgeId, year, month);

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const overrides = await getOverridesForLodge(
    selectedLodgeId,
    monthStart,
    monthEnd
  );

  const overrideDates = new Set<string>();
  for (const o of overrides) {
    const start = new Date(o.startDate + "T00:00:00Z");
    const end = new Date(o.endDate + "T00:00:00Z");
    const cur = new Date(start);
    while (cur <= end) {
      overrideDates.add(cur.toISOString().split("T")[0]);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  const availabilityWithOverrides = availability.map((a) => ({
    date: a.date,
    totalBeds: a.totalBeds,
    bookedBeds: a.bookedBeds,
    hasOverride: overrideDates.has(a.date),
  }));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Availability</h1>
          <p className="text-muted-foreground">
            View and manage lodge availability.
          </p>
        </div>
      </div>

      <AdminAvailabilityClient
        lodges={orgLodges}
        selectedLodgeId={selectedLodgeId}
        availability={availabilityWithOverrides}
        overrides={overrides.map((o) => ({
          id: o.id,
          startDate: o.startDate,
          endDate: o.endDate,
          type: o.type,
          bedReduction: o.bedReduction,
          reason: o.reason,
        }))}
        year={year}
        month={month}
        slug={slug}
      />
    </div>
  );
}
