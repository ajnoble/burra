"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

type Lodge = { id: string; name: string };

const STATUSES = [
  { value: "", label: "All Statuses" },
  { value: "WAITING", label: "Waiting" },
  { value: "NOTIFIED", label: "Notified" },
  { value: "CONVERTED", label: "Converted" },
  { value: "EXPIRED", label: "Expired" },
];

export function WaitlistFilters({ lodges }: { lodges: Lodge[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearFilters() {
    router.push(pathname);
  }

  const hasFilters = searchParams.toString().length > 0;
  const currentStatus = searchParams.get("status") ?? "";
  const currentLodgeId = searchParams.get("lodgeId") ?? "";

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        value={currentStatus}
        onChange={(e) => updateParam("status", e.target.value)}
        aria-label="Filter by status"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        value={currentLodgeId}
        onChange={(e) => updateParam("lodgeId", e.target.value)}
        aria-label="Filter by lodge"
      >
        <option value="">All Lodges</option>
        {lodges.map((lodge) => (
          <option key={lodge.id} value={lodge.id}>
            {lodge.name}
          </option>
        ))}
      </select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
