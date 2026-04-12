import { getOrgBySlug } from "@/lib/org";
import { getSessionMember } from "@/lib/auth";
import { notFound } from "next/navigation";
import { db } from "@/db/index";
import { lodges, seasons, bookingRounds, members } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
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

  // Load session if available — availability page is public, so no redirect on failure
  const session = await getSessionMember(org.id);

  const [orgLodges, activeSeasons] = await Promise.all([
    db
      .select({ id: lodges.id, name: lodges.name, totalBeds: lodges.totalBeds })
      .from(lodges)
      .where(and(eq(lodges.organisationId, org.id), eq(lodges.isActive, true))),
    db
      .select({
        id: seasons.id,
        name: seasons.name,
        startDate: seasons.startDate,
        endDate: seasons.endDate,
      })
      .from(seasons)
      .where(
        and(eq(seasons.organisationId, org.id), eq(seasons.isActive, true))
      ),
  ]);

  // Load open rounds only when a logged-in financial member is present
  let openRounds: { id: string; name: string }[] = [];
  if (session) {
    const [member] = await db
      .select({
        isFinancial: members.isFinancial,
        membershipClassId: members.membershipClassId,
      })
      .from(members)
      .where(eq(members.id, session.memberId));

    if (member?.isFinancial) {
      const now = new Date();
      for (const season of activeSeasons) {
        const rounds = await db
          .select()
          .from(bookingRounds)
          .where(
            and(
              eq(bookingRounds.seasonId, season.id),
              lte(bookingRounds.opensAt, now),
              gte(bookingRounds.closesAt, now)
            )
          );

        for (const round of rounds) {
          const allowedClasses = round.allowedMembershipClassIds;
          if (
            allowedClasses.length === 0 ||
            allowedClasses.includes(member.membershipClassId)
          ) {
            openRounds.push({ id: round.id, name: round.name });
          }
        }
      }
    }
  }

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
        openRounds={openRounds}
        memberId={session?.memberId}
      />
    </div>
  );
}
