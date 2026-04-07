"use client";

import { type TreasurerStatsResult } from "@/actions/dashboard/treasurer-stats";
import { formatCurrency } from "@/lib/currency";
import { StatCard } from "./stat-card";
import { RevenueChart } from "./revenue-chart";

type Props = {
  data: TreasurerStatsResult;
};

function calcTrend(
  current: number,
  prior: number
): { value: string; direction: "up" | "down" | "neutral" } {
  if (prior === 0) {
    return { value: "No prior data", direction: "neutral" };
  }
  const pct = Math.round(((current - prior) / prior) * 100);
  const direction: "up" | "down" | "neutral" =
    pct > 0 ? "up" : pct < 0 ? "down" : "neutral";
  const sign = pct > 0 ? "+" : "";
  return { value: `${sign}${pct}% vs prior year`, direction };
}

export function TreasurerTab({ data }: Props) {
  const revenueTrend = calcTrend(data.revenueYtdCents, data.revenuePriorYtdCents);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue (MTD)"
          value={formatCurrency(data.revenueMtdCents)}
        />
        <StatCard
          label="Revenue (YTD)"
          value={formatCurrency(data.revenueYtdCents)}
          trend={revenueTrend}
        />
        <StatCard
          label="Outstanding Balances"
          value={formatCurrency(data.outstandingBalanceCents)}
        />
        <StatCard
          label="Platform Fees (YTD)"
          value={formatCurrency(data.platformFeesYtdCents)}
        />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="text-base font-semibold mb-4">Monthly Revenue</h2>
        <RevenueChart data={data.monthlyRevenue} />
      </div>
    </div>
  );
}
