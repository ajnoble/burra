"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { approveBooking } from "@/actions/bookings/approve";
import { cancelBooking } from "@/actions/bookings/cancel";
import { calculateRefundAmount, daysUntilDate } from "@/lib/refund";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";

type CancellationRule = { daysBeforeCheckin: number; forfeitPercentage: number };

type Props = {
  bookingId: string;
  organisationId: string;
  status: string;
  slug: string;
  approverMemberId: string;
  defaultApprovalNote: string;
  totalAmountCents: number;
  balancePaidAt: string | null;
  checkInDate: string;
  policyRules: CancellationRule[] | null;
};

export function BookingActions({
  bookingId,
  organisationId,
  status,
  slug,
  approverMemberId,
  defaultApprovalNote,
  totalAmountCents,
  balancePaidAt,
  checkInDate,
  policyRules,
}: Props) {
  const [approveOpen, setApproveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [approvalNote, setApprovalNote] = useState(defaultApprovalNote);
  const [cancelReason, setCancelReason] = useState("");
  const [refundOverride, setRefundOverride] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Calculate policy-based refund for preview
  const isPaid = !!balancePaidAt;
  const daysUntil = daysUntilDate(checkInDate);
  const policyRefund =
    isPaid && policyRules && policyRules.length > 0
      ? calculateRefundAmount({
          rules: policyRules,
          totalPaidCents: totalAmountCents,
          daysUntilCheckin: daysUntil,
        })
      : null;

  async function handleApprove() {
    setSubmitting(true);
    try {
      const result = await approveBooking({
        bookingId,
        organisationId,
        approverMemberId,
        note: approvalNote || undefined,
        slug,
      });
      if (result.success) {
        toast.success("Booking approved");
        setApproveOpen(false);
      } else {
        toast.error(result.error ?? "Failed to approve booking");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve booking");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) {
      toast.error("A cancellation reason is required");
      return;
    }
    setSubmitting(true);
    try {
      const refundOverrideCents =
        refundOverride !== "" ? Math.round(parseFloat(refundOverride) * 100) : undefined;
      const result = await cancelBooking({
        bookingId,
        organisationId,
        cancelledByMemberId: approverMemberId,
        reason: cancelReason,
        refundOverrideCents,
        slug,
      });
      if (result.success) {
        const refundMsg =
          result.refundAmountCents && result.refundAmountCents > 0
            ? ` Refund: ${formatCurrency(result.refundAmountCents)}`
            : "";
        toast.success(`Booking cancelled.${refundMsg}`);
        setCancelOpen(false);
      } else {
        toast.error(result.error ?? "Failed to cancel booking");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel booking");
    } finally {
      setSubmitting(false);
    }
  }

  const canApprove = status === "PENDING";
  const canCancel = status === "PENDING" || status === "CONFIRMED";

  if (!canApprove && !canCancel) return null;

  return (
    <div className="flex gap-2">
      {canApprove && (
        <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
          <DialogTrigger render={<Button variant="default" />}>
            Approve
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve Booking</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This will confirm the booking and notify the member.
              </p>
              <div className="space-y-2">
                <Label htmlFor="approval-note">Approval note (optional)</Label>
                <Textarea
                  id="approval-note"
                  value={approvalNote}
                  onChange={(e) => setApprovalNote(e.target.value)}
                  rows={3}
                  placeholder="Add a note for the member..."
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={submitting}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {submitting ? "Approving..." : "Approve Booking"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {canCancel && (
        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogTrigger render={<Button variant="destructive" />}>
            Cancel Booking
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel Booking</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {isPaid && (
                <div className="rounded-lg border p-3 space-y-2 bg-muted/50">
                  <p className="text-sm font-medium">Refund Calculation</p>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total paid</span>
                      <span>{formatCurrency(totalAmountCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Days until check-in</span>
                      <span>{daysUntil}</span>
                    </div>
                    {policyRefund && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Policy forfeit</span>
                          <span>{policyRefund.forfeitPercentage}%</span>
                        </div>
                        <div className="flex justify-between font-medium">
                          <span>Policy refund</span>
                          <span>{formatCurrency(policyRefund.refundAmountCents)}</span>
                        </div>
                      </>
                    )}
                    {!policyRefund && (
                      <p className="text-muted-foreground text-xs">No cancellation policy — full refund will apply unless overridden.</p>
                    )}
                  </div>
                  <div className="space-y-1 pt-1">
                    <Label htmlFor="refund-override" className="text-xs">
                      Override refund amount (AUD, leave blank for policy default)
                    </Label>
                    <Input
                      id="refund-override"
                      type="number"
                      min="0"
                      step="0.01"
                      value={refundOverride}
                      onChange={(e) => setRefundOverride(e.target.value)}
                      placeholder={
                        policyRefund
                          ? (policyRefund.refundAmountCents / 100).toFixed(2)
                          : (totalAmountCents / 100).toFixed(2)
                      }
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="cancel-reason">Cancellation reason *</Label>
                <Textarea
                  id="cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  placeholder="Reason for cancellation..."
                  required
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={submitting}>
                  Back
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={submitting || !cancelReason.trim()}
                >
                  {submitting ? "Cancelling..." : "Cancel Booking"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
