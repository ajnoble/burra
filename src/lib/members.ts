import { db } from "@/db/index";
import {
  members,
  organisationMembers,
  membershipClasses,
  financialStatusChanges,
} from "@/db/schema";
import { eq, and, or, ilike, desc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const PAGE_SIZE = 25;

export type MemberFilters = {
  search?: string;
  membershipClassId?: string;
  role?: string;
  isFinancial?: boolean;
  hasFamily?: boolean;
  joinedFrom?: string;
  joinedTo?: string;
  page?: number;
};

export async function getMembers(orgId: string, filters: MemberFilters) {
  const page = filters.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [eq(members.organisationId, orgId)];

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(members.firstName, pattern),
        ilike(members.lastName, pattern),
        ilike(members.email, pattern)
      )!
    );
  }

  if (filters.membershipClassId) {
    conditions.push(eq(members.membershipClassId, filters.membershipClassId));
  }

  if (filters.isFinancial !== undefined) {
    conditions.push(eq(members.isFinancial, filters.isFinancial));
  }

  if (filters.hasFamily === true) {
    conditions.push(
      or(
        sql`${members.primaryMemberId} IS NOT NULL`,
        sql`EXISTS (SELECT 1 FROM members m2 WHERE m2.primary_member_id = ${members.id})`
      )!
    );
  } else if (filters.hasFamily === false) {
    conditions.push(
      and(
        sql`${members.primaryMemberId} IS NULL`,
        sql`NOT EXISTS (SELECT 1 FROM members m2 WHERE m2.primary_member_id = ${members.id})`
      )!
    );
  }

  if (filters.joinedFrom) {
    conditions.push(sql`${members.joinedAt} >= ${filters.joinedFrom}`);
  }
  if (filters.joinedTo) {
    conditions.push(sql`${members.joinedAt} <= ${filters.joinedTo}`);
  }

  const rows = await db
    .select({
      id: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
      email: members.email,
      phone: members.phone,
      memberNumber: members.memberNumber,
      isFinancial: members.isFinancial,
      joinedAt: members.joinedAt,
      primaryMemberId: members.primaryMemberId,
      membershipClassName: membershipClasses.name,
      role: organisationMembers.role,
    })
    .from(members)
    .innerJoin(
      organisationMembers,
      and(
        eq(organisationMembers.memberId, members.id),
        eq(organisationMembers.organisationId, orgId)
      )
    )
    .leftJoin(
      membershipClasses,
      eq(membershipClasses.id, members.membershipClassId)
    )
    .where(and(...conditions))
    .orderBy(members.lastName, members.firstName)
    .limit(PAGE_SIZE)
    .offset(offset);

  if (filters.role) {
    return {
      rows: rows.filter((r) => r.role === filters.role),
      total: rows.length,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  return { rows, total: rows.length, page, pageSize: PAGE_SIZE };
}

export async function getMemberById(orgId: string, memberId: string) {
  const [row] = await db
    .select({
      id: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
      email: members.email,
      phone: members.phone,
      dateOfBirth: members.dateOfBirth,
      memberNumber: members.memberNumber,
      isFinancial: members.isFinancial,
      joinedAt: members.joinedAt,
      primaryMemberId: members.primaryMemberId,
      notes: members.notes,
      membershipClassId: members.membershipClassId,
      membershipClassName: membershipClasses.name,
      role: organisationMembers.role,
    })
    .from(members)
    .innerJoin(
      organisationMembers,
      and(
        eq(organisationMembers.memberId, members.id),
        eq(organisationMembers.organisationId, orgId)
      )
    )
    .leftJoin(
      membershipClasses,
      eq(membershipClasses.id, members.membershipClassId)
    )
    .where(and(eq(members.id, memberId), eq(members.organisationId, orgId)))
    .limit(1);

  return row ?? null;
}

export async function getFamilyMembers(orgId: string, primaryMemberId: string) {
  return db
    .select({
      id: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
      email: members.email,
      membershipClassName: membershipClasses.name,
    })
    .from(members)
    .leftJoin(
      membershipClasses,
      eq(membershipClasses.id, members.membershipClassId)
    )
    .where(
      and(
        eq(members.organisationId, orgId),
        eq(members.primaryMemberId, primaryMemberId)
      )
    );
}

export async function getFinancialHistory(orgId: string, memberId: string) {
  const changedBy = alias(members, "changedBy");
  return db
    .select({
      id: financialStatusChanges.id,
      isFinancial: financialStatusChanges.isFinancial,
      reason: financialStatusChanges.reason,
      createdAt: financialStatusChanges.createdAt,
      changedByFirstName: changedBy.firstName,
      changedByLastName: changedBy.lastName,
    })
    .from(financialStatusChanges)
    .leftJoin(changedBy, eq(changedBy.id, financialStatusChanges.changedByMemberId))
    .where(
      and(
        eq(financialStatusChanges.organisationId, orgId),
        eq(financialStatusChanges.memberId, memberId)
      )
    )
    .orderBy(desc(financialStatusChanges.createdAt));
}

export async function searchMembers(orgId: string, query: string) {
  const pattern = `%${query}%`;
  return db
    .select({
      id: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
      email: members.email,
    })
    .from(members)
    .where(
      and(
        eq(members.organisationId, orgId),
        or(
          ilike(members.firstName, pattern),
          ilike(members.lastName, pattern),
          ilike(members.email, pattern)
        )
      )
    )
    .limit(10);
}
