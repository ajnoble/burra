"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type OccupancyDataPoint = {
  date: string;
  occupancyPercent: number;
};

type Props = {
  data: OccupancyDataPoint[];
};

export function OccupancyChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) =>
            typeof value === "number" ? `${value}%` : String(value ?? "")
          }
        />
        <Area
          type="monotone"
          dataKey="occupancyPercent"
          stroke="#2563eb"
          fill="#2563eb"
          fillOpacity={0.2}
          name="Occupancy %"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
