"use server";

import {
  getAuditLogEntries,
  type AuditLogFilters,
} from "@/actions/audit-log/queries";
import { serialiseAuditLogCsv } from "@/actions/audit-log/export-csv";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";

export async function exportAuditLogCsv(
  filters: AuditLogFilters
): Promise<string> {
  const session = await getSessionMember(filters.organisationId);
  if (!session || !isCommitteeOrAbove(session.role)) {
    throw new Error("Not authorised");
  }

  const { rows } = await getAuditLogEntries({
    ...filters,
    page: 1,
    pageSize: 10000,
  });
  return serialiseAuditLogCsv(rows);
}
