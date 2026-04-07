"use client";

import { type CommitteeStatsResult } from "@/actions/dashboard/committee-stats";
import { formatCurrency } from "@/lib/currency";
import { StatCard } from "./stat-card";

type Props = {
  data: CommitteeStatsResult;
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

export function CommitteeTab({ data }: Props) {
  const membersTrend = calcTrend(
    data.totalActiveMembers,
    data.totalActiveMembersPriorYear
  );
  const revenueTrend = calcTrend(data.revenueYtdCents, data.revenuePriorYtdCents);
  const totalMembers = data.financialMemberCount + data.nonFinancialMemberCount;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Members"
          value={String(data.totalActiveMembers)}
          trend={membersTrend}
        />
        <StatCard
          label="Revenue YTD"
          value={formatCurrency(data.revenueYtdCents)}
          trend={revenueTrend}
        />
        <StatCard
          label="Season Occupancy"
          value={`${data.occupancySeasonPercent}%`}
        />
        <StatCard
          label="Financial Members"
          value={`${data.financialMemberCount} / ${totalMembers}`}
        />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="text-base font-semibold mb-4">Membership Breakdown</h2>
        {data.membersByClass.length === 0 ? (
          <p className="text-sm text-muted-foreground">No membership data</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                    Class
                  </th>
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                    Total
                  </th>
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                    Financial
                  </th>
                  <th className="text-left py-2 font-medium text-muted-foreground">
                    Non-Financial
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.membersByClass.map((row) => (
                  <tr key={row.className} className="border-b last:border-0">
                    <td className="py-2 pr-4">{row.className}</td>
                    <td className="py-2 pr-4">{row.count}</td>
                    <td className="py-2 pr-4">{row.financialCount}</td>
                    <td className="py-2">{row.count - row.financialCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
