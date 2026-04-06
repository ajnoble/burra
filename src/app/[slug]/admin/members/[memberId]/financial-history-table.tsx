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
  );
}
