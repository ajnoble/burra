"use server";

import { db } from "@/db/index";
import { members, membershipClasses, organisationMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { sortMembersWithFamilyFirst as _sortMembersWithFamilyFirst } from "./members-helpers";

export type { BookableMember } from "./members-helpers";

/**
 * Get all org members the current user can add as guests to a booking.
 * Returns sorted: current member first, family second, others last.
 */
export async function getBookableMembers(
  organisationId: string,
  currentMemberId: string
): Promise<{
  id: string;
  firstName: string;
  lastName: string;
  primaryMemberId: string | null;
  membershipClassName: string;
}[]> {
  const rows = await db
    .select({
      id: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
      primaryMemberId: members.primaryMemberId,
      membershipClassName: membershipClasses.name,
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
    .leftJoin(
      membershipClasses,
      eq(membershipClasses.id, members.membershipClassId)
    )
    .where(
      and(
        eq(members.organisationId, organisationId),
        eq(members.isFinancial, true)
      )
    );

  // Drizzle returns nullable join columns — provide fallback
  const cleaned = rows.map((r) => ({
    ...r,
    membershipClassName: r.membershipClassName ?? "Standard",
  }));

  return _sortMembersWithFamilyFirst(cleaned, currentMemberId);
}
