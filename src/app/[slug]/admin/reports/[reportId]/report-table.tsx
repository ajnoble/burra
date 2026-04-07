type Column = {
  key: string;
  header: string;
  align?: "left" | "right";
};

interface ReportTableProps {
  columns: Column[];
  rows: Record<string, string | number>[];
  emptyMessage?: string;
}

export function ReportTable({
  columns,
  rows,
  emptyMessage = "No data found.",
}: ReportTableProps) {
  if (rows.length === 0) {
    return (
      <div className="border rounded-md p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-2 font-medium text-muted-foreground ${
                  col.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-2 ${
                    col.align === "right" ? "text-right tabular-nums" : ""
                  }`}
                >
                  {row[col.key] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
