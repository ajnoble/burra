"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type RevenueDataPoint = {
  month: string;
  bookingCents: number;
  subscriptionCents: number;
  refundCents: number;
};

type Props = {
  data: RevenueDataPoint[];
};

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function RevenueChart({ data }: Props) {
  const chartData = data.map((d) => ({
    month: d.month,
    Bookings: d.bookingCents / 100,
    Subscriptions: d.subscriptionCents / 100,
    Refunds: d.refundCents / 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis
          tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) =>
            typeof value === "number" ? formatDollars(value * 100) : String(value ?? "")
          }
        />
        <Legend />
        <Bar dataKey="Bookings" fill="#2563eb" />
        <Bar dataKey="Subscriptions" fill="#16a34a" />
        <Bar dataKey="Refunds" fill="#dc2626" />
      </BarChart>
    </ResponsiveContainer>
  );
}
