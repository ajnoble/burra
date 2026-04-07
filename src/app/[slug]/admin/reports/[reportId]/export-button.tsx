"use client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

type Column = { key: string; header: string };

interface ExportButtonProps {
  data: Record<string, string>[];
  columns: Column[];
  filename: string;
}

function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function ExportButton({ data, columns, filename }: ExportButtonProps) {
  function handleClick() {
    const header = columns.map((c) => escapeCsvValue(c.header)).join(",");
    const rows = data.map((row) =>
      columns.map((c) => escapeCsvValue(row[c.key] ?? "")).join(",")
    );
    const csv = [header, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      <Download className="mr-2 h-4 w-4" />
      Export CSV
    </Button>
  );
}
