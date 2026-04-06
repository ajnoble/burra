"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cancelBooking } from "@/actions/bookings/cancel";
import { calculateRefundAmount, daysUntilDate } from "@/lib/refund";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";

type CancellationRule = { daysBeforeCheckin: number; forfeitPercentage: number };

type Props = {
  bookingId: string;
  organisationId: string;
  slug: string;
  memberId: string;
  totalAmountCents: number;
  balancePaidAt: string | null;
  checkInDate: string;
  policyRules: CancellationRule[] | null;
};

export function CancelBookingDialog({
  bookingId,
  organisationId,
  slug,
  memberId,
  totalAmountCents,
  balancePaidAt,
  checkInDate,
  policyRules,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  async function handleCancel() {
    if (!reason.trim()) {
      toast.error("A cancellation reason is required");
      return;
    }
    setSubmitting(true);
    try {
      const result = await cancelBooking({
        bookingId,
        organisationId,
        cancelledByMemberId: memberId,
        reason,
        slug,
      });
      if (result.success) {
        const refundMsg =
          result.refundAmountCents && result.refundAmountCents > 0
            ? ` Refund: ${formatCurrency(result.refundAmountCents)}`
            : "";
        toast.success(`Booking cancelled.${refundMsg}`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to cancel booking");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel booking");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        Cancel Booking
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel Booking</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isPaid ? (
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
                {policyRefund ? (
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
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No cancellation policy — full refund will apply.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No payment has been made, so no refund will be issued.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Cancellation reason *</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reason for cancellation..."
              required
            />
          </div>

          <p className="text-sm text-destructive font-medium">
            This will release your beds and cannot be undone.
          </p>

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={submitting || !reason.trim()}
            >
              {submitting ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
