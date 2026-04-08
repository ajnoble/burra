"use server";

import { db } from "@/db/index";
import { members, organisationMembers, membershipClasses } from "@/db/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import type { CommunicationFilters } from "@/db/schema/communications";

type ResolveRecipientsInput = {
  organisationId: string;
  filters: CommunicationFilters;
  channel: "EMAIL" | "SMS" | "BOTH";
};

export async function resolveRecipients(input: ResolveRecipientsInput) {
  try {
    // Build conditions
    const conditions = [
      eq(members.organisationId, input.organisationId),
      eq(organisationMembers.isActive, true),
    ];

    if (
      input.filters.membershipClassIds &&
      input.filters.membershipClassIds.length > 0
    ) {
      conditions.push(
        inArray(members.membershipClassId, input.filters.membershipClassIds)
      );
    }

    if (input.filters.isFinancial !== undefined) {
      conditions.push(eq(members.isFinancial, input.filters.isFinancial));
    }

    if (input.filters.role) {
      conditions.push(
        eq(
          organisationMembers.role,
          input.filters.role as
            | "MEMBER"
            | "BOOKING_OFFICER"
            | "COMMITTEE"
            | "ADMIN"
        )
      );
    }

    // Query members with joins
    const rows = await db
      .select()
      .from(members)
      .innerJoin(
        organisationMembers,
        and(
          eq(organisationMembers.memberId, members.id),
          eq(
            organisationMembers.organisationId,
            members.organisationId
          )
        )
      )
      .leftJoin(
        membershipClasses,
        eq(membershipClasses.id, members.membershipClassId)
      )
      .where(and(...conditions))
      .orderBy(asc(members.lastName), asc(members.firstName));

    // Apply manualExclude
    const excludeSet = new Set(input.filters.manualExclude ?? []);
    const filtered = rows.filter(
      (r) => !excludeSet.has(r.members.id)
    );

    // Map to recipient format with contact flags
    const recipients = filtered.map((r) => ({
      id: r.members.id,
      firstName: r.members.firstName,
      lastName: r.members.lastName,
      email: r.members.email,
      phone: r.members.phone,
      membershipClassId: r.members.membershipClassId,
      membershipClassName: r.membershipClasses?.name ?? null,
      role: r.organisationMembers.role,
      isFinancial: r.members.isFinancial,
      hasEmail: Boolean(r.members.email),
      hasPhone: Boolean(r.members.phone),
    }));

    const emailCount = recipients.filter((r) => r.hasEmail).length;
    const smsCount = recipients.filter((r) => r.hasPhone).length;

    return { success: true, recipients, emailCount, smsCount };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to resolve recipients",
      recipients: [],
      emailCount: 0,
      smsCount: 0,
    };
  }
}
