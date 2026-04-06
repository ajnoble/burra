"use server";

import { db } from "@/db/index";
import { members, membershipClasses, organisationMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type BookableMember = {
  id: string;
  firstName: string;
  lastName: string;
  primaryMemberId: string | null;
  membershipClassName: string;
};

/**
 * Pure sorting function: current member first, family second, others last.
 * Testable without DB.
 */
export function sortMembersWithFamilyFirst(
  allMembers: BookableMember[],
  currentMemberId: string
): BookableMember[] {
  const current = allMembers.find((m) => m.id === currentMemberId);
  if (!current) return allMembers;

  // Determine the family "root" — either the current member or their primary
  const familyRootId = current.primaryMemberId ?? currentMemberId;

  const familyIds = new Set<string>();
  familyIds.add(familyRootId);
  // Add all members linked to the family root
  for (const m of allMembers) {
    if (m.primaryMemberId === familyRootId) {
      familyIds.add(m.id);
    }
  }

  const currentMember: BookableMember[] = [];
  const family: BookableMember[] = [];
  const others: BookableMember[] = [];

  for (const m of allMembers) {
    if (m.id === currentMemberId) {
      currentMember.push(m);
    } else if (familyIds.has(m.id)) {
      family.push(m);
    } else {
      others.push(m);
    }
  }

  return [...currentMember, ...family, ...others];
}

/**
 * Get all org members the current user can add as guests to a booking.
 * Returns sorted: current member first, family second, others last.
 */
export async function getBookableMembers(
  organisationId: string,
  currentMemberId: string
): Promise<BookableMember[]> {
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

  return sortMembersWithFamilyFirst(cleaned, currentMemberId);
}
