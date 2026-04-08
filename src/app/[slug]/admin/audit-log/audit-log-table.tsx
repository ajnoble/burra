"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type EnrichedRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  createdAt: string;
  actorFirstName: string | null;
  actorLastName: string | null;
  actorMemberId: string;
  changeSummary: string;
  entityUrl: string | null;
};

interface AuditLogTableProps {
  rows: EnrichedRow[];
  total: number;
  page: number;
  pageSize: number;
  basePath: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function DiffView({ row }: { row: EnrichedRow }) {
  const previous = row.previousValue as Record<string, unknown> | null;
  const next = row.newValue as Record<string, unknown> | null;

  const allKeys = new Set([
    ...Object.keys(previous ?? {}),
    ...Object.keys(next ?? {}),
  ]);

  return (
    <div className="px-4 py-3 bg-muted/20 border-t text-sm space-y-2">
      {allKeys.size > 0 ? (
        <div className="space-y-1">
          {Array.from(allKeys).map((key) => {
            const oldVal = previous?.[key];
            const newVal = next?.[key];
            return (
              <div key={key} className="flex flex-wrap gap-2">
                <span className="font-medium min-w-[120px]">{key}:</span>
                {previous !== null && (
                  <span className="text-red-600 line-through">
                    {formatValue(oldVal)}
                  </span>
                )}
                {next !== null && (
                  <span className="text-green-600">{formatValue(newVal)}</span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground">No field changes recorded.</p>
      )}
      {row.entityUrl && (
        <Link href={row.entityUrl}>
          <Button variant="outline" size="sm" className="mt-2">
            View {row.entityType}
          </Button>
        </Link>
      )}
    </div>
  );
}

export function AuditLogTable({
  rows,
  total,
  page,
  pageSize,
  basePath,
}: AuditLogTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function navigatePage(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`${basePath}?${params.toString()}`);
  }

  if (rows.length === 0) {
    return (
      <div className="border rounded-md p-8 text-center text-sm text-muted-foreground">
        No audit log entries found.
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="px-4 py-2 font-medium text-muted-foreground text-left">
                Date
              </th>
              <th className="px-4 py-2 font-medium text-muted-foreground text-left">
                Actor
              </th>
              <th className="px-4 py-2 font-medium text-muted-foreground text-left">
                Action
              </th>
              <th className="px-4 py-2 font-medium text-muted-foreground text-left">
                Entity
              </th>
              <th className="px-4 py-2 font-medium text-muted-foreground text-left">
                Changes
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isExpanded = expandedId === row.id;
              const actorName =
                [row.actorFirstName, row.actorLastName]
                  .filter(Boolean)
                  .join(" ") || "Unknown";

              return (
                <Fragment key={row.id}>
                  <tr
                    className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : row.id)
                    }
                  >
                    <td className="px-4 py-2 whitespace-nowrap">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-2">{actorName}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline">{row.action}</Badge>
                    </td>
                    <td className="px-4 py-2">{row.entityType}</td>
                    <td className="px-4 py-2 max-w-xs truncate">
                      {row.changeSummary}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={5}>
                        <DiffView row={row} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {rows.map((row) => {
          const isExpanded = expandedId === row.id;
          const actorName =
            [row.actorFirstName, row.actorLastName]
              .filter(Boolean)
              .join(" ") || "Unknown";

          return (
            <div
              key={row.id}
              className="rounded-lg border p-4 space-y-1 cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : row.id)}
            >
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date</span>
                <span>{formatDate(row.createdAt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Actor</span>
                <span>{actorName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Action</span>
                <Badge variant="outline">{row.action}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Entity</span>
                <span>{row.entityType}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Changes</span>
                <span className="truncate max-w-[200px]">
                  {row.changeSummary}
                </span>
              </div>
              {isExpanded && <DiffView row={row} />}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => navigatePage(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => navigatePage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
