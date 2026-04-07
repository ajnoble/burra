"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/currency";
import { createConsolidatedCheckoutSession } from "@/actions/stripe/consolidated-checkout";

type OutstandingItem = {
  type: "ONE_OFF_CHARGE" | "SUBSCRIPTION" | "BOOKING_INVOICE";
  id: string;
  description: string;
  memberName: string;
  amountCents: number;
  dueDate?: string | null;
};

type FamilyChargesSectionProps = {
  items: OutstandingItem[];
  organisationId: string;
  slug: string;
};

export function FamilyChargesSection({
  items,
  organisationId,
  slug,
}: FamilyChargesSectionProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.map((i) => i.id))
  );
  const [loading, setLoading] = useState(false);

  if (items.length === 0) return null;

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(items.map((i) => i.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  const selectedItems = items.filter((i) => selected.has(i.id));
  const totalCents = selectedItems.reduce((sum, i) => sum + i.amountCents, 0);

  async function handlePay() {
    if (selectedItems.length === 0) return;

    setLoading(true);
    try {
      const chargeIds = selectedItems
        .filter((i) => i.type === "ONE_OFF_CHARGE")
        .map((i) => i.id);
      const subscriptionIds = selectedItems
        .filter((i) => i.type === "SUBSCRIPTION")
        .map((i) => i.id);
      const invoiceTransactionIds = selectedItems
        .filter((i) => i.type === "BOOKING_INVOICE")
        .map((i) => i.id);

      const result = await createConsolidatedCheckoutSession({
        organisationId,
        slug,
        chargeIds,
        subscriptionIds,
        invoiceTransactionIds,
      });

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
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">Outstanding Charges</h3>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={selectAll}
            className="text-primary underline-offset-4 hover:underline"
          >
            Select all
          </button>
          <span className="text-muted-foreground">/</span>
          <button
            type="button"
            onClick={clearAll}
            className="text-primary underline-offset-4 hover:underline"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3 rounded-md border p-3"
          >
            <input
              type="checkbox"
              id={`charge-${item.id}`}
              checked={selected.has(item.id)}
              onChange={() => toggleItem(item.id)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary accent-primary cursor-pointer"
            />
            <div className="flex flex-1 items-start justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <label
                  htmlFor={`charge-${item.id}`}
                  className="text-sm font-medium cursor-pointer"
                >
                  {item.description}
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">
                    {item.memberName}
                  </Badge>
                  {item.dueDate && (
                    <span className="text-xs text-muted-foreground">
                      Due {item.dueDate}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-sm font-medium whitespace-nowrap">
                {formatCurrency(item.amountCents)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-4 pt-3 border-t">
        <span className="text-sm text-muted-foreground">
          Total: <span className="font-medium text-foreground">{formatCurrency(totalCents)}</span>
        </span>
        <Button
          size="sm"
          onClick={handlePay}
          disabled={loading || selectedItems.length === 0}
        >
          {loading ? "Loading..." : `Pay ${formatCurrency(totalCents)}`}
        </Button>
      </div>
    </div>
  );
}
