"use server";

import {
  getAuditLogEntries,
  type AuditLogFilters,
} from "@/actions/audit-log/queries";
import { serialiseAuditLogCsv } from "@/actions/audit-log/export-csv";

export async function exportAuditLogCsv(
  filters: AuditLogFilters
): Promise<string> {
  const { rows } = await getAuditLogEntries({
    ...filters,
    page: 1,
    pageSize: 10000,
  });
  return serialiseAuditLogCsv(rows);
}
