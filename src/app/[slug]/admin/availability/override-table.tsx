"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteAvailabilityOverride } from "@/actions/availability/overrides";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Override = {
  id: string;
  startDate: string;
  endDate: string;
  type: string;
  bedReduction: number | null;
  reason: string | null;
};

type Props = {
  overrides: Override[];
  onEdit: (override: Override) => void;
  slug: string;
};

export function OverrideTable({ overrides, onEdit, slug }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this override?")) return;
    setDeleting(id);
    await deleteAvailabilityOverride({ id, slug });
    setDeleting(null);
    router.refresh();
  }

  if (overrides.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No overrides for this period.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Dates</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Details</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {overrides.map((o) => (
          <TableRow key={o.id}>
            <TableCell className="text-sm">
              {o.startDate} to {o.endDate}
            </TableCell>
            <TableCell>
              <Badge variant={o.type === "CLOSURE" ? "destructive" : "outline"}>
                {o.type}
              </Badge>
            </TableCell>
            <TableCell className="text-sm">
              {o.type === "REDUCTION" && o.bedReduction
                ? `${o.bedReduction} beds`
                : "Full closure"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {o.reason || "—"}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(o)}>
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(o.id)}
                  disabled={deleting === o.id}
                >
                  {deleting === o.id ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
