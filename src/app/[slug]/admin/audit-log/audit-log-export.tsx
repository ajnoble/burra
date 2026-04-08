"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { exportAuditLogCsv } from "./export-action";
import type { AuditLogFilters } from "@/actions/audit-log/queries";

interface AuditLogExportProps {
  filters: AuditLogFilters;
}

export function AuditLogExport({ filters }: AuditLogExportProps) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const csv = await exportAuditLogCsv(filters);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "audit-log.csv";
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={exporting}
      onClick={handleExport}
    >
      {exporting ? "Exporting..." : "Export CSV"}
    </Button>
  );
}
