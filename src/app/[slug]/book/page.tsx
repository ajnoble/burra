import { getOrgBySlug } from "@/lib/org";
import { getSessionMember } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/index";
import { lodges, seasons, bookingRounds, members } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { BookingWizard } from "./booking-wizard";

export default async function BookingPage({
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
        <h1 className="text-2xl font-bold mb-2">Book a Stay</h1>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-destructive font-medium">
            Your membership is not currently financial. Please contact the
            committee to resolve this before making a booking.
          </p>
        </div>
      </div>
    );
  }

  // Get active lodges
  const orgLodges = await db
    .select({
      id: lodges.id,
      name: lodges.name,
      totalBeds: lodges.totalBeds,
      checkInTime: lodges.checkInTime,
      checkOutTime: lodges.checkOutTime,
    })
    .from(lodges)
    .where(and(eq(lodges.organisationId, org.id), eq(lodges.isActive, true)));

  if (orgLodges.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Book a Stay</h1>
        <p className="text-muted-foreground">
          No lodges are currently available for booking.
        </p>
      </div>
    );
  }

  // Get active seasons with their open booking rounds
  const now = new Date();
  const activeSeasons = await db
    .select({
      id: seasons.id,
      name: seasons.name,
      startDate: seasons.startDate,
      endDate: seasons.endDate,
    })
    .from(seasons)
    .where(
      and(
        eq(seasons.organisationId, org.id),
        eq(seasons.isActive, true)
      )
    );

  // Get open booking rounds that this member's class is eligible for
  const openRounds: {
    id: string;
    name: string;
    seasonId: string;
    opensAt: Date;
    closesAt: Date;
    maxNightsPerBooking: number | null;
    maxNightsPerMember: number | null;
    holdDurationMinutes: number | null;
    requiresApproval: boolean;
  }[] = [];

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
      // Check membership class eligibility
      const allowedClasses = round.allowedMembershipClassIds;
      if (
        allowedClasses.length === 0 ||
        allowedClasses.includes(member.membershipClassId)
      ) {
        openRounds.push(round);
      }
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Book a Stay</h1>
      <p className="text-muted-foreground mb-6">
        Select your lodge, dates, guests, and beds to make a booking.
      </p>

      <BookingWizard
        organisationId={org.id}
        slug={slug}
        lodges={orgLodges}
        seasons={activeSeasons}
        openRounds={openRounds}
        memberId={session.memberId}
        memberName={`${session.firstName} ${session.lastName}`}
        membershipClassId={member.membershipClassId}
      />
    </div>
  );
}
