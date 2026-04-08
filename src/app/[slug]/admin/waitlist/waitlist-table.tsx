"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notifyWaitlistEntry } from "@/actions/waitlist/notify";
import { removeWaitlistEntry } from "@/actions/waitlist/remove";

type WaitlistEntry = {
  waitlist_entries: {
    id: string;
    checkInDate: string;
    checkOutDate: string;
    numberOfGuests: number;
    status: "WAITING" | "NOTIFIED" | "CONVERTED" | "EXPIRED";
    createdAt: Date;
    notifiedAt: Date | null;
  };
  members: {
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  lodges: {
    id: string;
    name: string;
  } | null;
};

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "WAITING":
      return <Badge variant="outline">{status}</Badge>;
    case "NOTIFIED":
      return <Badge variant="secondary">{status}</Badge>;
    case "CONVERTED":
      return <Badge variant="default">{status}</Badge>;
    case "EXPIRED":
      return <Badge variant="destructive">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(date: string | Date | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-AU");
}

function ActionButtons({
  entry,
  organisationId,
  slug,
}: {
  entry: WaitlistEntry;
  organisationId: string;
  slug: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [loadingAction, setLoadingAction] = useState<"notify" | "remove" | null>(null);
  const router = useRouter();

  const entryId = entry.waitlist_entries.id;
  const status = entry.waitlist_entries.status;

  function handleNotify() {
    setLoadingAction("notify");
    startTransition(async () => {
      const result = await notifyWaitlistEntry({
        waitlistEntryId: entryId,
        organisationId,
        slug,
      });
      setLoadingAction(null);
      if (!result.success) {
        alert(`Failed to notify: ${result.error ?? "Unknown error"}`);
      }
    });
  }

  function handleRemove() {
    const memberName = entry.members
      ? `${entry.members.firstName} ${entry.members.lastName}`
      : "this member";
    if (!confirm(`Remove ${memberName} from the waitlist? This cannot be undone.`)) return;
    setLoadingAction("remove");
    startTransition(async () => {
      const result = await removeWaitlistEntry({
        waitlistEntryId: entryId,
        organisationId,
        slug,
      });
      setLoadingAction(null);
      if (!result.success) {
        alert(`Failed to remove: ${result.error ?? "Unknown error"}`);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {status === "WAITING" && (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={handleNotify}
        >
          {loadingAction === "notify" ? "Notifying..." : "Notify"}
        </Button>
      )}
      <Button
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={handleRemove}
      >
        {loadingAction === "remove" ? "Removing..." : "Remove"}
      </Button>
    </div>
  );
}

export function WaitlistTable({
  entries,
  page,
  pageSize,
  organisationId,
  slug,
}: {
  entries: WaitlistEntry[];
  page: number;
  pageSize: number;
  organisationId: string;
  slug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`);
  }

  const showPrev = page > 1;
  const showNext = entries.length === pageSize;

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Lodge</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Check-out</TableHead>
              <TableHead>Guests</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Notified</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground py-8"
                >
                  No waitlist entries found.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.waitlist_entries.id}>
                  <TableCell>
                    {entry.members
                      ? `${entry.members.firstName} ${entry.members.lastName}`
                      : "—"}
                  </TableCell>
                  <TableCell>{entry.lodges?.name ?? "—"}</TableCell>
                  <TableCell>{formatDate(entry.waitlist_entries.checkInDate)}</TableCell>
                  <TableCell>{formatDate(entry.waitlist_entries.checkOutDate)}</TableCell>
                  <TableCell>{entry.waitlist_entries.numberOfGuests}</TableCell>
                  <TableCell>
                    <StatusBadge status={entry.waitlist_entries.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(entry.waitlist_entries.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(entry.waitlist_entries.notifiedAt)}
                  </TableCell>
                  <TableCell>
                    <ActionButtons
                      entry={entry}
                      organisationId={organisationId}
                      slug={slug}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {entries.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No waitlist entries found.
          </p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.waitlist_entries.id}
              className="rounded-lg border p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {entry.members
                    ? `${entry.members.firstName} ${entry.members.lastName}`
                    : "—"}
                </p>
                <StatusBadge status={entry.waitlist_entries.status} />
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>{entry.lodges?.name ?? "—"}</p>
                <p>
                  {formatDate(entry.waitlist_entries.checkInDate)} —{" "}
                  {formatDate(entry.waitlist_entries.checkOutDate)}
                </p>
                <p>{entry.waitlist_entries.numberOfGuests} guest{entry.waitlist_entries.numberOfGuests !== 1 ? "s" : ""}</p>
                <p>Created: {formatDate(entry.waitlist_entries.createdAt)}</p>
                {entry.waitlist_entries.notifiedAt && (
                  <p>Notified: {formatDate(entry.waitlist_entries.notifiedAt)}</p>
                )}
              </div>
              <ActionButtons
                entry={entry}
                organisationId={organisationId}
                slug={slug}
              />
            </div>
          ))
        )}
      </div>

      {(showPrev || showNext) && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={!showPrev}
            onClick={() => goToPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm px-2">Page {page}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!showNext}
            onClick={() => goToPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
