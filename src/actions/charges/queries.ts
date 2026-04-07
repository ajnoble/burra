"use server";

import { db } from "@/db/index";
import { oneOffCharges, chargeCategories, members } from "@/db/schema";
import { and, eq, desc, inArray } from "drizzle-orm";

export type ChargeWithDetails = {
  id: string;
  memberId: string;
  memberFirstName: string;
  memberLastName: string;
  categoryId: string;
  categoryName: string;
  description: string | null;
  amountCents: number;
  dueDate: string | null;
  status: string;
  waivedReason: string | null;
  paidAt: Date | null;
  createdAt: Date;
};

export async function getChargesForMember(
  organisationId: string,
  memberId: string
): Promise<ChargeWithDetails[]> {
  const rows = await db
    .select({
      id: oneOffCharges.id,
      memberId: oneOffCharges.memberId,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      categoryId: oneOffCharges.categoryId,
      categoryName: chargeCategories.name,
      description: oneOffCharges.description,
      amountCents: oneOffCharges.amountCents,
      dueDate: oneOffCharges.dueDate,
      status: oneOffCharges.status,
      waivedReason: oneOffCharges.waivedReason,
      paidAt: oneOffCharges.paidAt,
      createdAt: oneOffCharges.createdAt,
    })
    .from(oneOffCharges)
    .innerJoin(chargeCategories, eq(chargeCategories.id, oneOffCharges.categoryId))
    .innerJoin(members, eq(members.id, oneOffCharges.memberId))
    .where(
      and(
        eq(oneOffCharges.organisationId, organisationId),
        eq(oneOffCharges.memberId, memberId)
      )
    )
    .orderBy(desc(oneOffCharges.createdAt));

  return rows;
}

export async function getChargesForOrganisation(
  organisationId: string,
  filters?: {
    status?: string;
    categoryId?: string;
    memberId?: string;
  }
): Promise<ChargeWithDetails[]> {
  const conditions = [eq(oneOffCharges.organisationId, organisationId)];

  if (filters?.status) {
    conditions.push(eq(oneOffCharges.status, filters.status as "UNPAID" | "PAID" | "WAIVED" | "CANCELLED"));
  }
  if (filters?.categoryId) {
    conditions.push(eq(oneOffCharges.categoryId, filters.categoryId));
  }
  if (filters?.memberId) {
    conditions.push(eq(oneOffCharges.memberId, filters.memberId));
  }

  const rows = await db
    .select({
      id: oneOffCharges.id,
      memberId: oneOffCharges.memberId,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      categoryId: oneOffCharges.categoryId,
      categoryName: chargeCategories.name,
      description: oneOffCharges.description,
      amountCents: oneOffCharges.amountCents,
      dueDate: oneOffCharges.dueDate,
      status: oneOffCharges.status,
      waivedReason: oneOffCharges.waivedReason,
      paidAt: oneOffCharges.paidAt,
      createdAt: oneOffCharges.createdAt,
    })
    .from(oneOffCharges)
    .innerJoin(chargeCategories, eq(chargeCategories.id, oneOffCharges.categoryId))
    .innerJoin(members, eq(members.id, oneOffCharges.memberId))
    .where(and(...conditions))
    .orderBy(desc(oneOffCharges.createdAt));

  return rows;
}

export async function getChargesForFamily(
  organisationId: string,
  primaryMemberId: string
): Promise<ChargeWithDetails[]> {
  const familyMembers = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organisationId, organisationId),
        eq(members.primaryMemberId, primaryMemberId)
      )
    );

  const memberIds = [primaryMemberId, ...familyMembers.map((m) => m.id)];

  const rows = await db
    .select({
      id: oneOffCharges.id,
      memberId: oneOffCharges.memberId,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      categoryId: oneOffCharges.categoryId,
      categoryName: chargeCategories.name,
      description: oneOffCharges.description,
      amountCents: oneOffCharges.amountCents,
      dueDate: oneOffCharges.dueDate,
      status: oneOffCharges.status,
      waivedReason: oneOffCharges.waivedReason,
      paidAt: oneOffCharges.paidAt,
      createdAt: oneOffCharges.createdAt,
    })
    .from(oneOffCharges)
    .innerJoin(chargeCategories, eq(chargeCategories.id, oneOffCharges.categoryId))
    .innerJoin(members, eq(members.id, oneOffCharges.memberId))
    .where(
      and(
        eq(oneOffCharges.organisationId, organisationId),
        inArray(oneOffCharges.memberId, memberIds)
      )
    )
    .orderBy(desc(oneOffCharges.createdAt));

  return rows;
}
