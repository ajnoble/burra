"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FilterField = {
  key: string;
  label: string;
  type: "date" | "select" | "text";
  options?: { value: string; label: string }[];
};

interface ReportFiltersProps {
  fields: FilterField[];
  basePath: string;
}

export function ReportFilters({ fields, basePath }: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const field of fields) {
      const value = formData.get(field.key);
      if (typeof value === "string" && value !== "") {
        params.set(field.key, value);
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
        {fields.map((field) => (
          <div key={field.key} className="flex flex-col gap-1">
            <Label htmlFor={field.key} className="text-xs text-muted-foreground">
              {field.label}
            </Label>
            {field.type === "select" ? (
              <select
                id={field.key}
                name={field.key}
                defaultValue={searchParams.get(field.key) ?? ""}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All</option>
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={field.key}
                name={field.key}
                type={field.type}
                defaultValue={searchParams.get(field.key) ?? ""}
                className="w-40"
              />
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            Filter
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleClear}>
            Clear
          </Button>
        </div>
      </div>
    </form>
  );
}
