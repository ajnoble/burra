import { serialiseCsv, type CsvColumn } from "@/actions/reports/export-csv";
import { formatChangeSummary } from "@/lib/audit-log";
import type { AuditLogRow } from "./queries";

const AUDIT_LOG_COLUMNS: CsvColumn[] = [
  { key: "date", header: "Date" },
  { key: "actor", header: "Actor" },
  { key: "action", header: "Action" },
  { key: "entityType", header: "Entity Type" },
  { key: "entityId", header: "Entity ID" },
  { key: "changes", header: "Changes" },
];

function formatDate(date: Date): string {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function serialiseAuditLogCsv(rows: AuditLogRow[]): string {
  const data = rows.map((row) => ({
    date: formatDate(row.createdAt),
    actor: [row.actorFirstName, row.actorLastName].filter(Boolean).join(" ") || "Unknown",
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    changes: formatChangeSummary(
      row.action,
      row.previousValue as Record<string, unknown> | null,
      row.newValue as Record<string, unknown> | null
    ),
  }));

  return serialiseCsv(AUDIT_LOG_COLUMNS, data);
}
