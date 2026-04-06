"use client";
import { formatCurrency } from "@/lib/currency";

type SummaryBarProps = {
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  totalWaived: number;
};

export function SummaryBar({ totalExpected, totalCollected, totalOutstanding, totalWaived }: SummaryBarProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-4 mb-6">
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Expected</p>
        <p className="text-xl font-bold">{formatCurrency(totalExpected)}</p>
      </div>
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Collected</p>
        <p className="text-xl font-bold text-green-600">{formatCurrency(totalCollected)}</p>
      </div>
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Outstanding</p>
        <p className="text-xl font-bold text-amber-600">{formatCurrency(totalOutstanding)}</p>
      </div>
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Waived</p>
        <p className="text-xl font-bold text-muted-foreground">{formatCurrency(totalWaived)}</p>
      </div>
    </div>
  );
}
