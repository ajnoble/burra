import { Card, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string;
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
};

export function StatCard({ label, value, trend }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {trend && (
          <div className="flex items-center gap-1 mt-1 text-xs">
            {trend.direction === "up" && (
              <ArrowUp className="h-3 w-3 text-green-600" />
            )}
            {trend.direction === "down" && (
              <ArrowDown className="h-3 w-3 text-red-600" />
            )}
            <span
              className={
                trend.direction === "up"
                  ? "text-green-600"
                  : trend.direction === "down"
                    ? "text-red-600"
                    : "text-muted-foreground"
              }
            >
              {trend.value}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
