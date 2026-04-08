export type CsvColumn = {
  key: string;
  header: string;
};

function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serialiseCsv(
  columns: CsvColumn[],
  data: Record<string, string>[]
): string {
  const header = columns.map((c) => escapeCsvValue(c.header)).join(",");
  const rows = data.map((row) =>
    columns.map((c) => escapeCsvValue(row[c.key] ?? "")).join(",")
  );
  return [header, ...rows].join("\n");
}

export const XERO_COLUMN_MAP: CsvColumn[] = [
  { key: "date", header: "Date" },
  { key: "amount", header: "Amount" },
  { key: "taxAmount", header: "Tax Amount" },
  { key: "taxType", header: "Tax Type" },
  { key: "payee", header: "Payee" },
  { key: "description", header: "Description" },
  { key: "reference", header: "Reference" },
];
