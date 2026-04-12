import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { db } from "@/db/index";
import { lodges, seasons } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { AvailabilityMatrixClient } from "./availability-matrix-client";
import { LodgeSelector } from "./lodge-selector";

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

  const [orgLodges, activeSeasons] = await Promise.all([
    db
      .select({ id: lodges.id, name: lodges.name, totalBeds: lodges.totalBeds })
      .from(lodges)
      .where(and(eq(lodges.organisationId, org.id), eq(lodges.isActive, true))),
    db
      .select({
        id: seasons.id,
        startDate: seasons.startDate,
        endDate: seasons.endDate,
      })
      .from(seasons)
      .where(
        and(eq(seasons.organisationId, org.id), eq(seasons.isActive, true))
      ),
  ]);

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

  const selectedLodge =
    orgLodges.find((l) => l.id === selectedLodgeId) ?? orgLodges[0];

  // Use the first active season for boundary clamping (if any)
  const activeSeason = activeSeasons[0];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Check Availability</h1>
      <p className="text-muted-foreground mb-6">
        See when beds are available at our lodges.
      </p>

      {/* Lodge selector — only shown when multiple lodges exist */}
      {orgLodges.length > 1 && (
        <div className="mb-6 w-64">
          <LodgeSelector
            lodges={orgLodges}
            selectedLodgeId={selectedLodge.id}
            slug={slug}
          />
        </div>
      )}

      <AvailabilityMatrixClient
        lodgeId={selectedLodge.id}
        lodgeName={selectedLodge.name}
        slug={slug}
        seasonStartDate={activeSeason?.startDate ?? undefined}
        seasonEndDate={activeSeason?.endDate ?? undefined}
      />
    </div>
  );
}
