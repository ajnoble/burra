import { db } from "@/db/index";
import { auditLog } from "@/db/schema";

type AuditLogInput = {
  organisationId: string;
  actorMemberId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
};

export async function createAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      organisationId: input.organisationId,
      actorMemberId: input.actorMemberId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      previousValue: input.previousValue,
      newValue: input.newValue,
    });
  } catch (error) {
    console.error("[audit-log] Failed to write audit log:", error);
  }
}

export function diffChanges(
  previous: Record<string, unknown>,
  current: Record<string, unknown>
): { previousValue: Record<string, unknown>; newValue: Record<string, unknown> } {
  const allKeys = new Set([
    ...Object.keys(previous),
    ...Object.keys(current),
  ]);

  const previousValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};

  for (const key of allKeys) {
    if (previous[key] !== current[key]) {
      previousValue[key] = previous[key];
      newValue[key] = current[key];
    }
  }

  return { previousValue, newValue };
}

export function formatChangeSummary(
  _action: string,
  previousValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null
): string {
  if (previousValue === null) return "Created";
  if (newValue === null) return "Deleted";

  const keys = Object.keys(previousValue);
  if (keys.length === 0) return "";

  return keys
    .map((key) => `${key}: ${previousValue[key]} → ${newValue[key]}`)
    .join(", ");
}

const ENTITY_URL_MAP: Record<string, (slug: string, entityId: string) => string> = {
  booking: (slug, entityId) => `/${slug}/admin/bookings/${entityId}`,
  member: (slug, entityId) => `/${slug}/admin/members/${entityId}`,
  subscription: (slug) => `/${slug}/admin/subscriptions`,
  charge: (slug) => `/${slug}/admin/charges`,
  document: (slug) => `/${slug}/admin/documents`,
  documentCategory: (slug) => `/${slug}/admin/documents`,
  communication: (slug) => `/${slug}/admin/communications`,
  waitlistEntry: (slug) => `/${slug}/admin/waitlist`,
  organisation: (slug) => `/${slug}/admin/settings`,
};

export function getEntityUrl(
  slug: string,
  entityType: string,
  entityId: string
): string | null {
  const builder = ENTITY_URL_MAP[entityType];
  if (!builder) return null;
  return builder(slug, entityId);
}
