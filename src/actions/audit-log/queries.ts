import { db } from "@/db/index";
import { auditLog, members } from "@/db/schema";
import { eq, and, gte, lte, desc, type SQL } from "drizzle-orm";

const DEFAULT_PAGE_SIZE = 25;

export type AuditLogFilters = {
  organisationId: string;
  action?: string;
  entityType?: string;
  actorMemberId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type AuditLogRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  createdAt: Date;
  actorFirstName: string | null;
  actorLastName: string | null;
  actorMemberId: string;
};

export async function getAuditLogEntries(
  filters: AuditLogFilters
): Promise<{ rows: AuditLogRow[]; total: number; page: number; pageSize: number }> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [eq(auditLog.organisationId, filters.organisationId)];

  if (filters.action) conditions.push(eq(auditLog.action, filters.action));
  if (filters.entityType) conditions.push(eq(auditLog.entityType, filters.entityType));
  if (filters.actorMemberId) conditions.push(eq(auditLog.actorMemberId, filters.actorMemberId));
  if (filters.dateFrom) conditions.push(gte(auditLog.createdAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(auditLog.createdAt, new Date(filters.dateTo + "T23:59:59")));

  const whereClause = and(...conditions)!;

  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      previousValue: auditLog.previousValue,
      newValue: auditLog.newValue,
      createdAt: auditLog.createdAt,
      actorFirstName: members.firstName,
      actorLastName: members.lastName,
      actorMemberId: auditLog.actorMemberId,
    })
    .from(auditLog)
    .leftJoin(members, eq(members.id, auditLog.actorMemberId))
    .where(whereClause)
    .orderBy(desc(auditLog.createdAt))
    .limit(pageSize)
    .offset(offset);

  const total = await db.$count(auditLog, whereClause);

  return { rows, total, page, pageSize };
}

export async function getDistinctActions(organisationId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ action: auditLog.action })
    .from(auditLog)
    .where(eq(auditLog.organisationId, organisationId))
    .orderBy(auditLog.action);

  return rows.map((r) => r.action);
}

export async function getDistinctActors(
  organisationId: string
): Promise<{ id: string; firstName: string | null; lastName: string | null }[]> {
  const rows = await db
    .selectDistinct({
      id: auditLog.actorMemberId,
      firstName: members.firstName,
      lastName: members.lastName,
    })
    .from(auditLog)
    .leftJoin(members, eq(members.id, auditLog.actorMemberId))
    .where(eq(auditLog.organisationId, organisationId))
    .orderBy(members.firstName, members.lastName);

  return rows;
}
