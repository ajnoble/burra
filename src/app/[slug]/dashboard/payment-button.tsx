"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createCheckoutSession } from "@/actions/stripe/checkout";

type PaymentButtonProps = {
  organisationId: string;
  transactionId: string;
  slug: string;
  amountCents: number;
};

export function PaymentButton({
  organisationId,
  transactionId,
  slug,
  amountCents,
}: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    setLoading(true);
    try {
      const result = await createCheckoutSession(organisationId, transactionId, slug);
      if (result.success && result.url) {
        window.location.href = result.url;
      } else {
        toast.error(result.error || "Failed to create payment session");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  const formatted = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amountCents / 100);

  return (
    <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 mt-2">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-yellow-500" />
        <span className="text-sm text-yellow-600 dark:text-yellow-400">
          Payment outstanding — {formatted}
        </span>
      </div>
      <Button
        size="sm"
        onClick={handlePay}
        disabled={loading}
        className="bg-green-600 hover:bg-green-700 text-white"
      >
        {loading ? "Loading..." : "Pay Now"}
      </Button>
    </div>
  );
}
