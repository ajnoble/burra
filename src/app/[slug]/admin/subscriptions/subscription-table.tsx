"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
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
import { formatCurrency } from "@/lib/currency";
import type { SubscriptionListItem } from "@/actions/subscriptions/queries";

type TableProps = {
  subscriptions: SubscriptionListItem[];
  total: number;
  page: number;
  pageSize: number;
  slug: string;
  organisationId: string;
};

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "PAID":
      return <Badge variant="default">{status}</Badge>;
    case "WAIVED":
      return <Badge variant="secondary">{status}</Badge>;
    case "UNPAID":
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function SubscriptionTable({
  subscriptions,
  total,
  page,
  pageSize,
  slug,
  organisationId,
}: TableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.ceil(total / pageSize);

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`);
  }

  async function handleWaive(subscriptionId: string) {
    const reason = prompt("Enter reason for waiving this subscription:");
    if (!reason) return;
    const { waiveSubscription } = await import("@/actions/subscriptions/admin-actions");
    const result = await waiveSubscription({ subscriptionId, organisationId, reason, slug });
    if (result.success) {
      router.refresh();
    } else {
      alert(`Error: ${result.error}`);
    }
  }

  async function handleAdjust(subscriptionId: string) {
    const input = prompt("Enter new amount in dollars (e.g. 150):");
    if (!input) return;
    const dollars = parseFloat(input);
    if (isNaN(dollars) || dollars < 0) {
      alert("Invalid amount.");
      return;
    }
    const amountCents = Math.round(dollars * 100);
    const { adjustSubscriptionAmount } = await import("@/actions/subscriptions/admin-actions");
    const result = await adjustSubscriptionAmount({ subscriptionId, organisationId, amountCents, slug });
    if (result.success) {
      router.refresh();
    } else {
      alert(`Error: ${result.error}`);
    }
  }

  async function handleRecordPayment(subscriptionId: string) {
    if (!confirm("Record an offline payment for this subscription?")) return;
    const { recordOfflinePayment } = await import("@/actions/subscriptions/admin-actions");
    const result = await recordOfflinePayment({ subscriptionId, organisationId, adminName: "Admin", slug });
    if (result.success) {
      router.refresh();
    } else {
      alert(`Error: ${result.error}`);
    }
  }

  async function handleRemind(subscriptionId: string) {
    const { sendSubscriptionReminder } = await import("@/actions/subscriptions/send-reminder");
    const result = await sendSubscriptionReminder({ subscriptionId, organisationId });
    if (result.success) {
      alert("Reminder sent.");
    } else {
      alert(`Error: ${result.error}`);
    }
  }

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subscriptions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  No subscriptions found.
                </TableCell>
              </TableRow>
            ) : (
              subscriptions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    <div className="font-medium">{sub.memberName}</div>
                    <div className="text-xs text-muted-foreground">{sub.memberEmail}</div>
                  </TableCell>
                  <TableCell>{sub.membershipClassName}</TableCell>
                  <TableCell>{formatCurrency(sub.amountCents)}</TableCell>
                  <TableCell>
                    {new Date(sub.dueDate).toLocaleDateString("en-AU")}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={sub.status} />
                  </TableCell>
                  <TableCell>
                    {sub.paidAt
                      ? new Date(sub.paidAt).toLocaleDateString("en-AU")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {sub.status === "UNPAID" && (
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleWaive(sub.id)}
                        >
                          Waive
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAdjust(sub.id)}
                        >
                          Adjust
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRecordPayment(sub.id)}
                        >
                          Record Payment
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemind(sub.id)}
                        >
                          Remind
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {subscriptions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No subscriptions found.</p>
        ) : (
          subscriptions.map((sub) => (
            <div key={sub.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{sub.memberName}</div>
                  <div className="text-xs text-muted-foreground">{sub.memberEmail}</div>
                </div>
                <StatusBadge status={sub.status} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{sub.membershipClassName}</span>
                <span className="font-medium">{formatCurrency(sub.amountCents)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Due: {new Date(sub.dueDate).toLocaleDateString("en-AU")}</span>
                {sub.paidAt && (
                  <span>Paid: {new Date(sub.paidAt).toLocaleDateString("en-AU")}</span>
                )}
              </div>
              {sub.status === "UNPAID" && (
                <div className="flex flex-wrap gap-1 pt-1">
                  <Button variant="outline" size="sm" onClick={() => handleWaive(sub.id)}>
                    Waive
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleAdjust(sub.id)}>
                    Adjust
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleRecordPayment(sub.id)}>
                    Record Payment
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleRemind(sub.id)}>
                    Remind
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              Previous
            </Button>
            <span className="flex items-center text-sm px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
