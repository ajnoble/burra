import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { db } from "@/db/index";
import { lodges } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getMonthAvailability } from "@/actions/availability/queries";
import { MemberAvailabilityClient } from "./member-availability-client";

export default async function MemberAvailabilityPage({
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
          No lodges available at the moment.
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

  const availabilityData = availability.map((a) => ({
    date: a.date,
    totalBeds: a.totalBeds,
    bookedBeds: a.bookedBeds,
    hasOverride: false,
  }));

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Check Availability</h1>
      <p className="text-muted-foreground mb-6">
        See when beds are available at our lodges.
      </p>

      <MemberAvailabilityClient
        lodges={orgLodges}
        selectedLodgeId={selectedLodgeId}
        availability={availabilityData}
        year={year}
        month={month}
        slug={slug}
      />
    </div>
  );
}
