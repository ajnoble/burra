"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AuditLogFiltersProps {
  basePath: string;
  actionOptions: { value: string; label: string }[];
  entityTypeOptions: { value: string; label: string }[];
  memberOptions: { value: string; label: string }[];
}

const FILTER_KEYS = [
  "action",
  "entityType",
  "actorMemberId",
  "dateFrom",
  "dateTo",
] as const;

export function AuditLogFilters({
  basePath,
  actionOptions,
  entityTypeOptions,
  memberOptions,
}: AuditLogFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const value = formData.get(key);
      if (typeof value === "string" && value !== "") {
        params.set(key, value);
      }
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function handleClear() {
    router.push(basePath);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="flex flex-col gap-1">
          <Label htmlFor="action" className="text-xs text-muted-foreground">
            Action
          </Label>
          <select
            id="action"
            name="action"
            defaultValue={searchParams.get("action") ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All</option>
            {actionOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label
            htmlFor="entityType"
            className="text-xs text-muted-foreground"
          >
            Entity Type
          </Label>
          <select
            id="entityType"
            name="entityType"
            defaultValue={searchParams.get("entityType") ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All</option>
            {entityTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label
            htmlFor="actorMemberId"
            className="text-xs text-muted-foreground"
          >
            Actor
          </Label>
          <select
            id="actorMemberId"
            name="actorMemberId"
            defaultValue={searchParams.get("actorMemberId") ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All</option>
            {memberOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="dateFrom" className="text-xs text-muted-foreground">
            Date From
          </Label>
          <Input
            id="dateFrom"
            name="dateFrom"
            type="date"
            defaultValue={searchParams.get("dateFrom") ?? ""}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="dateTo" className="text-xs text-muted-foreground">
            Date To
          </Label>
          <Input
            id="dateTo"
            name="dateTo"
            type="date"
            defaultValue={searchParams.get("dateTo") ?? ""}
            className="w-40"
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" size="sm">
            Filter
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
          >
            Clear
          </Button>
        </div>
      </div>
    </form>
  );
}
