import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/index";
import { members, organisationMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { cache } from "react";

export type SessionMember = {
  memberId: string;
  organisationId: string;
  role: "MEMBER" | "BOOKING_OFFICER" | "COMMITTEE" | "ADMIN";
  firstName: string;
  lastName: string;
  email: string;
};

/**
 * Get the current authenticated user's member record for an organisation.
 * Returns null if not authenticated or not a member of the org.
 */
export const getSessionMember = cache(
  async (organisationId: string): Promise<SessionMember | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    // Find member by profile (auth user) email matching member email
    const [member] = await db
      .select({
        memberId: members.id,
        firstName: members.firstName,
        lastName: members.lastName,
        email: members.email,
      })
      .from(members)
      .where(
        and(
          eq(members.organisationId, organisationId),
          eq(members.email, user.email!)
        )
      )
      .limit(1);

    if (!member) return null;

    const [orgMember] = await db
      .select({ role: organisationMembers.role })
      .from(organisationMembers)
      .where(
        and(
          eq(organisationMembers.organisationId, organisationId),
          eq(organisationMembers.memberId, member.memberId),
          eq(organisationMembers.isActive, true)
        )
      )
      .limit(1);

    if (!orgMember) return null;

    return {
      memberId: member.memberId,
      organisationId,
      role: orgMember.role,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
    };
  }
);

const ADMIN_ROLES = ["ADMIN", "COMMITTEE", "BOOKING_OFFICER"] as const;

export function canAccessAdmin(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

export function isAdmin(role: string): boolean {
  return role === "ADMIN";
}

export function isCommitteeOrAbove(role: string): boolean {
  return role === "ADMIN" || role === "COMMITTEE";
}
