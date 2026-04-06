"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createConnectAccount, generateOnboardingLink } from "@/actions/stripe/onboarding";

type StripeConnectCardProps = {
  organisationId: string;
  slug: string;
  status: "not_started" | "pending" | "complete";
  accountId?: string | null;
  platformFeeBps: number;
};

export function StripeConnectCard({
  organisationId,
  slug,
  status,
  accountId,
  platformFeeBps,
}: StripeConnectCardProps) {
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    try {
      const result = await createConnectAccount(organisationId, slug);
      if (result.success && result.url) {
        window.location.href = result.url;
      } else {
        toast.error(result.error || "Failed to start Stripe onboarding");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handleContinueSetup() {
    setLoading(true);
    try {
      const result = await generateOnboardingLink(organisationId, slug);
      if (result.success && result.url) {
        window.location.href = result.url;
      } else {
        toast.error(result.error || "Failed to generate onboarding link");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  const feePercent = (platformFeeBps / 100).toFixed(platformFeeBps % 100 === 0 ? 0 : 1);

  return (
    <div className="rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium">Payment Processing</h3>
          <p className="text-sm text-muted-foreground">
            {status === "complete"
              ? "Stripe Connect is active for your organisation"
              : "Connect your Stripe account to accept booking payments"}
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
            status === "complete"
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
              : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
          }`}
        >
          {status === "complete"
            ? "Connected"
            : status === "pending"
              ? "Pending"
              : "Not connected"}
        </span>
      </div>

      {status === "not_started" && (
        <>
          <div className="rounded-md bg-muted p-4 mb-4">
            <p className="text-sm text-muted-foreground">
              Stripe Connect lets your club accept credit card payments for
              bookings. Members will be able to pay invoices directly from their
              dashboard. A {feePercent}% platform fee applies to each transaction.
            </p>
          </div>
          <Button onClick={handleConnect} disabled={loading}>
            {loading ? "Connecting..." : "Connect with Stripe →"}
          </Button>
        </>
      )}

      {status === "pending" && (
        <>
          <div className="rounded-md bg-muted p-4 mb-4">
            <p className="text-sm text-muted-foreground">
              Your Stripe account has been created but onboarding is not yet
              complete. Click below to continue the setup process.
            </p>
          </div>
          <Button onClick={handleContinueSetup} disabled={loading}>
            {loading ? "Loading..." : "Continue Setup →"}
          </Button>
        </>
      )}

      {status === "complete" && accountId && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Account ID</span>
            <span className="font-mono">
              {accountId.slice(0, 9)}...{accountId.slice(-4)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <span className="text-green-600 dark:text-green-400">Charges enabled</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Platform fee</span>
            <span>{feePercent}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
