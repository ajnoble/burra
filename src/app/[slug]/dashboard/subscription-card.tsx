"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";

type SubscriptionCardProps = {
  subscription: {
    id: string;
    amountCents: number;
    dueDate: string;
    status: string;
    paidAt: Date | null;
  };
  organisationId: string;
  slug: string;
  stripeConnected: boolean;
};

export function SubscriptionCard({
  subscription,
  organisationId,
  slug,
  stripeConnected,
}: SubscriptionCardProps) {
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    setLoading(true);
    try {
      const { createSubscriptionCheckoutSession } = await import(
        "@/actions/subscriptions/checkout"
      );
      const result = await createSubscriptionCheckoutSession(
        organisationId,
        subscription.id,
        slug
      );
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

  return (
    <div className="rounded-lg border p-4">
      <h3 className="font-medium mb-3">Membership Subscription</h3>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">
          {formatCurrency(subscription.amountCents)} due {subscription.dueDate}
        </p>
      </div>
      {subscription.status === "PAID" && subscription.paidAt ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-sm text-green-600 dark:text-green-400">
            Paid{" "}
            {subscription.paidAt.toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      ) : subscription.status === "WAIVED" ? (
        <Badge variant="secondary">Waived</Badge>
      ) : subscription.status === "UNPAID" && stripeConnected ? (
        <Button
          size="sm"
          onClick={handlePay}
          disabled={loading}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {loading ? "Loading..." : "Pay Subscription"}
        </Button>
      ) : subscription.status === "UNPAID" ? (
        <Badge variant="secondary">Unpaid</Badge>
      ) : null}
    </div>
  );
}
