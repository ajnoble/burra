"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Lodge = { id: string; name: string };

export function BookingFilters({
  lodges,
  pendingCount,
}: {
  lodges: Lodge[];
  pendingCount: number;
}) {
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
    params.delete("page"); // reset to page 1 on filter change
    router.push(`${pathname}?${params.toString()}`);
  }

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    // Clear status-related params first
    params.delete("status");
    params.delete("dateFrom");
    params.delete("unpaid");
    params.delete("page");
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearFilters() {
    router.push(pathname);
  }

  const hasFilters = searchParams.toString().length > 0;
  const currentStatus = searchParams.get("status") ?? "";
  const currentDateFrom = searchParams.get("dateFrom") ?? "";
  const currentUnpaid = searchParams.get("unpaid") ?? "";

  const today = new Date().toISOString().split("T")[0];

  const isAllTab = !currentStatus && !currentDateFrom && !currentUnpaid;
  const isPendingTab = currentStatus === "PENDING" && !currentDateFrom && !currentUnpaid;
  const isUpcomingTab =
    currentStatus === "CONFIRMED" && currentDateFrom === today && !currentUnpaid;
  const isUnpaidTab = currentStatus === "CONFIRMED" && currentUnpaid === "true";

  return (
    <div className="mb-6 space-y-3">
      {/* Quick filter tabs */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={isAllTab ? "default" : "outline"}
          size="sm"
          onClick={() => clearFilters()}
        >
          All
        </Button>
        <Button
          variant={isPendingTab ? "default" : pendingCount > 0 ? "secondary" : "outline"}
          size="sm"
          onClick={() => updateParams({ status: "PENDING" })}
        >
          Pending Approval ({pendingCount})
        </Button>
        <Button
          variant={isUpcomingTab ? "default" : "outline"}
          size="sm"
          onClick={() => updateParams({ status: "CONFIRMED", dateFrom: today })}
        >
          Upcoming
        </Button>
        <Button
          variant={isUnpaidTab ? "default" : "outline"}
          size="sm"
          onClick={() => updateParams({ status: "CONFIRMED", unpaid: "true" })}
        >
          Unpaid
        </Button>
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search reference or member..."
          defaultValue={searchParams.get("search") ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            if (value.length === 0 || value.length >= 2) {
              updateParam("search", value);
            }
          }}
          className="w-64"
        />

        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={currentStatus}
          onChange={(e) => updateParam("status", e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="COMPLETED">Completed</option>
        </select>

        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={searchParams.get("lodgeId") ?? ""}
          onChange={(e) => updateParam("lodgeId", e.target.value)}
        >
          <option value="">All Lodges</option>
          {lodges.map((lodge) => (
            <option key={lodge.id} value={lodge.id}>
              {lodge.name}
            </option>
          ))}
        </select>

        <Input
          type="date"
          placeholder="Date from"
          defaultValue={searchParams.get("dateFrom") ?? ""}
          onChange={(e) => updateParam("dateFrom", e.target.value)}
          className="w-40"
        />

        <Input
          type="date"
          placeholder="Date to"
          defaultValue={searchParams.get("dateTo") ?? ""}
          onChange={(e) => updateParam("dateTo", e.target.value)}
          className="w-40"
        />

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
