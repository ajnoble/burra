"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/currency";
import type { ChargeWithDetails } from "@/actions/charges/queries";
import {
  markChargeAsPaid,
  waiveCharge,
  cancelCharge,
} from "@/actions/charges/update-status";

type Props = {
  charges: ChargeWithDetails[];
  organisationId: string;
  slug: string;
  showMemberName?: boolean;
};

type WaiveDialogState = {
  chargeId: string;
  open: boolean;
};

const STATUS_BADGE: Record<
  string,
  "destructive" | "default" | "secondary" | "outline"
> = {
  UNPAID: "destructive",
  PAID: "default",
  WAIVED: "secondary",
  CANCELLED: "outline",
};

export function ChargesTable({
  charges,
  organisationId,
  slug,
  showMemberName,
}: Props) {
  const router = useRouter();
  const [waiveDialog, setWaiveDialog] = useState<WaiveDialogState>({
    chargeId: "",
    open: false,
  });
  const [waiveReason, setWaiveReason] = useState("");
  const [loading, setLoading] = useState<string | null>(null);

  async function handleMarkPaid(chargeId: string) {
    setLoading(chargeId + "-paid");
    try {
      const result = await markChargeAsPaid({ chargeId, organisationId, slug });
      if (!result.success) {
        toast.error(result.error ?? "Failed to mark as paid");
        return;
      }
      toast.success("Charge marked as paid");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark as paid");
    } finally {
      setLoading(null);
    }
  }

  async function handleCancel(chargeId: string) {
    setLoading(chargeId + "-cancel");
    try {
      const result = await cancelCharge({ chargeId, organisationId, slug });
      if (!result.success) {
        toast.error(result.error ?? "Failed to cancel charge");
        return;
      }
      toast.success("Charge cancelled");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel charge");
    } finally {
      setLoading(null);
    }
  }

  async function handleWaiveSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { chargeId } = waiveDialog;
    setLoading(chargeId + "-waive");
    try {
      const result = await waiveCharge({
        chargeId,
        organisationId,
        reason: waiveReason,
        slug,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to waive charge");
        return;
      }
      toast.success("Charge waived");
      setWaiveDialog({ chargeId: "", open: false });
      setWaiveReason("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to waive charge");
    } finally {
      setLoading(null);
    }
  }

  if (charges.length === 0) {
    return <p className="text-muted-foreground text-sm">No charges found.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {showMemberName && (
                <th className="px-4 py-3 text-left font-medium">Member</th>
              )}
              <th className="px-4 py-3 text-left font-medium">Category</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
              <th className="px-4 py-3 text-left font-medium">Amount</th>
              <th className="px-4 py-3 text-left font-medium">Due Date</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {charges.map((charge) => (
              <tr key={charge.id} className="border-t hover:bg-muted/30">
                {showMemberName && (
                  <td className="px-4 py-3">
                    {charge.memberFirstName} {charge.memberLastName}
                  </td>
                )}
                <td className="px-4 py-3">{charge.categoryName}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {charge.description ?? "—"}
                </td>
                <td className="px-4 py-3">{formatCurrency(charge.amountCents)}</td>
                <td className="px-4 py-3">
                  {charge.dueDate
                    ? new Date(charge.dueDate).toLocaleDateString("en-AU")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_BADGE[charge.status] ?? "outline"}>
                    {charge.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {charge.status === "UNPAID" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loading === charge.id + "-paid"}
                        onClick={() => handleMarkPaid(charge.id)}
                      >
                        Mark Paid
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setWaiveDialog({ chargeId: charge.id, open: true });
                          setWaiveReason("");
                        }}
                      >
                        Waive
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loading === charge.id + "-cancel"}
                        onClick={() => handleCancel(charge.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={waiveDialog.open}
        onOpenChange={(open) => setWaiveDialog((prev) => ({ ...prev, open }))}
      >
        <DialogTrigger className="hidden" />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Waive Charge</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleWaiveSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="waive-reason">Reason</Label>
              <Input
                id="waive-reason"
                value={waiveReason}
                onChange={(e) => setWaiveReason(e.target.value)}
                placeholder="Reason for waiving this charge"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading === waiveDialog.chargeId + "-waive" || !waiveReason}
            >
              {loading === waiveDialog.chargeId + "-waive" ? "Waiving..." : "Waive Charge"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
