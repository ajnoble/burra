import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type HistoryEntry = {
  id: string;
  isFinancial: boolean;
  reason: string;
  createdAt: Date;
  changedByFirstName: string | null;
  changedByLastName: string | null;
};

export function FinancialHistoryTable({
  history,
}: {
  history: HistoryEntry[];
}) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No financial status changes recorded.
      </p>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Changed By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-sm">
                  {new Date(entry.createdAt).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </TableCell>
                <TableCell>
                  <Badge variant={entry.isFinancial ? "default" : "destructive"}>
                    {entry.isFinancial ? "Financial" : "Unfinancial"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{entry.reason}</TableCell>
                <TableCell className="text-sm">
                  {entry.changedByFirstName} {entry.changedByLastName}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {history.map((entry) => (
          <div key={entry.id} className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {new Date(entry.createdAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <Badge variant={entry.isFinancial ? "default" : "destructive"}>
                {entry.isFinancial ? "Financial" : "Unfinancial"}
              </Badge>
            </div>
            <p className="text-sm">{entry.reason}</p>
            <p className="text-xs text-muted-foreground">
              By: {entry.changedByFirstName} {entry.changedByLastName}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
