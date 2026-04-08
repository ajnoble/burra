"use server";

import { db } from "@/db/index";
import {
  members,
  membershipClasses,
  organisationMembers,
  organisations,
  subscriptions,
  seasons,
} from "@/db/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { calculateGst } from "@/lib/currency";
import { revalidatePath } from "next/cache";
import { getSessionMember, canAccessAdmin } from "@/lib/auth";

type GenerateSubscriptionsInput = {
  organisationId: string;
  seasonId: string;
  slug: string;
};

type GenerateSubscriptionsResult =
  | { success: true; generated: number }
  | { success: false; error: string };

export async function generateSubscriptions(
  input: GenerateSubscriptionsInput
): Promise<GenerateSubscriptionsResult> {
  const session = await getSessionMember(input.organisationId);
  if (!session || !canAccessAdmin(session.role)) {
    return { success: false, error: "Not authorised" };
  }

  const { organisationId, seasonId, slug } = input;

  // 1. Look up the season to get the dueDate
  const [season] = await db
    .select({ id: seasons.id, startDate: seasons.startDate })
    .from(seasons)
    .where(and(eq(seasons.id, seasonId), eq(seasons.organisationId, organisationId)));

  if (!season) {
    return { success: false, error: "Season not found" };
  }

  const [orgGst] = await db
    .select({
      gstEnabled: organisations.gstEnabled,
      gstRateBps: organisations.gstRateBps,
    })
    .from(organisations)
    .where(eq(organisations.id, organisationId));

  // 2. Find eligible members:
  //    - Active org member
  //    - Membership class has non-null annualFeeCents
  //    - No existing subscription for this season
  const eligible = await db
    .select({
      memberId: members.id,
      amountCents: membershipClasses.annualFeeCents,
    })
    .from(members)
    .innerJoin(
      organisationMembers,
      and(
        eq(organisationMembers.memberId, members.id),
        eq(organisationMembers.organisationId, organisationId),
        eq(organisationMembers.isActive, true)
      )
    )
    .innerJoin(
      membershipClasses,
      and(
        eq(membershipClasses.id, members.membershipClassId),
        isNotNull(membershipClasses.annualFeeCents)
      )
    )
    .leftJoin(
      subscriptions,
      and(
        eq(subscriptions.memberId, members.id),
        eq(subscriptions.seasonId, seasonId)
      )
    )
    .where(isNull(subscriptions.id));

  if (eligible.length === 0) {
    return { success: true, generated: 0 };
  }

  // 3. Bulk insert subscription records
  await db.insert(subscriptions).values(
    eligible.map((row) => ({
      organisationId,
      memberId: row.memberId,
      seasonId,
      amountCents: row.amountCents as number,
      dueDate: season.startDate,
      status: "UNPAID" as const,
      gstAmountCents: orgGst?.gstEnabled
        ? calculateGst(row.amountCents as number, orgGst.gstRateBps)
        : 0,
    }))
  );

  revalidatePath(`/${slug}/admin/subscriptions`);

  return { success: true, generated: eligible.length };
}
