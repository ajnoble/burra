export type BookableMember = {
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
