import { getOrgBySlug } from "@/lib/org";
import { getSessionMember } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/index";
import { lodges, seasons, bookingRounds, members } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { WaitlistForm } from "./waitlist-form";

export default async function WaitlistPage({
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

  const session = await getSessionMember(org.id);
  if (!session) {
    redirect(`/${slug}/login`);
  }

  // Check member is financial
  const [member] = await db
    .select({
      isFinancial: members.isFinancial,
      membershipClassId: members.membershipClassId,
    })
    .from(members)
    .where(eq(members.id, session.memberId));

  if (!member?.isFinancial) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Join Waitlist</h1>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-destructive font-medium">
            Your membership is not currently financial. Please contact the
            committee to resolve this before joining the waitlist.
          </p>
        </div>
      </div>
    );
  }

  // Get active lodges
  const orgLodges = await db
    .select({ id: lodges.id, name: lodges.name })
    .from(lodges)
    .where(and(eq(lodges.organisationId, org.id), eq(lodges.isActive, true)));

  if (orgLodges.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Join Waitlist</h1>
        <p className="text-muted-foreground">
          No lodges are currently available.
        </p>
      </div>
    );
  }

  // Get active booking rounds the member's class is eligible for
  const now = new Date();
  const activeSeasons = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(
      and(eq(seasons.organisationId, org.id), eq(seasons.isActive, true))
    );

  const eligibleRounds: { id: string; name: string; seasonId: string }[] = [];

  for (const season of activeSeasons) {
    const rounds = await db
      .select({
        id: bookingRounds.id,
        name: bookingRounds.name,
        seasonId: bookingRounds.seasonId,
        allowedMembershipClassIds: bookingRounds.allowedMembershipClassIds,
      })
      .from(bookingRounds)
      .where(
        and(
          eq(bookingRounds.seasonId, season.id),
          lte(bookingRounds.opensAt, now),
          gte(bookingRounds.closesAt, now)
        )
      );

    for (const round of rounds) {
      const allowed = round.allowedMembershipClassIds;
      if (
        allowed.length === 0 ||
        allowed.includes(member.membershipClassId)
      ) {
        eligibleRounds.push({
          id: round.id,
          name: round.name,
          seasonId: round.seasonId,
        });
      }
    }
  }

  // Pre-fill values from searchParams
  const initialLodgeId =
    typeof sp.lodgeId === "string" ? sp.lodgeId : undefined;
  const initialCheckIn =
    typeof sp.checkIn === "string" ? sp.checkIn : undefined;
  const initialCheckOut =
    typeof sp.checkOut === "string" ? sp.checkOut : undefined;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Join Waitlist</h1>
      <p className="text-muted-foreground mb-6">
        The dates you want are fully booked. Add yourself to the waitlist and
        we&apos;ll notify you if a spot opens up.
      </p>

      {eligibleRounds.length === 0 ? (
        <div className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            There are no open booking rounds for your membership class at this
            time. Please check back later or contact the committee.
          </p>
        </div>
      ) : (
        <WaitlistForm
          organisationId={org.id}
          slug={slug}
          lodges={orgLodges}
          bookingRounds={eligibleRounds}
          initialLodgeId={initialLodgeId}
          initialCheckIn={initialCheckIn}
          initialCheckOut={initialCheckOut}
        />
      )}
    </div>
  );
}
