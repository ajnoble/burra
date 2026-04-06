"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

type FiltersProps = {
  seasons: { id: string; name: string }[];
  membershipClasses: { id: string; name: string }[];
  activeSeasonId: string | null;
  organisationId: string;
  slug: string;
};

export function SubscriptionFilters({
  seasons,
  membershipClasses,
  activeSeasonId,
  organisationId,
  slug,
}: FiltersProps) {
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

  const currentSeasonId = searchParams.get("seasonId") ?? activeSeasonId ?? "";
  const currentStatus = searchParams.get("status") ?? "";
  const currentClassId = searchParams.get("classId") ?? "";

  async function handleGenerateMissing() {
    if (!currentSeasonId) {
      alert("No season selected.");
      return;
    }
    const { generateSubscriptions } = await import("@/actions/subscriptions/generate");
    const result = await generateSubscriptions({
      organisationId,
      seasonId: currentSeasonId,
      slug,
    });
    if (result.success) {
      alert(`Generated ${result.generated} subscription(s).`);
      router.refresh();
    } else {
      alert(`Error: ${result.error}`);
    }
  }

  async function handleSendReminders() {
    if (!currentSeasonId) {
      alert("No season selected.");
      return;
    }
    if (!confirm("Send reminders to all unpaid members for this season?")) return;
    const { sendBulkReminders } = await import("@/actions/subscriptions/send-reminder");
    const result = await sendBulkReminders({
      organisationId,
      seasonId: currentSeasonId,
    });
    alert(`Sent ${result.sent} reminder(s).`);
  }

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={currentSeasonId}
          onChange={(e) => updateParam("seasonId", e.target.value)}
        >
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
            </option>
          ))}
        </select>

        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={currentStatus}
          onChange={(e) => updateParam("status", e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PAID">Paid</option>
          <option value="WAIVED">Waived</option>
        </select>

        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={currentClassId}
          onChange={(e) => updateParam("classId", e.target.value)}
        >
          <option value="">All Classes</option>
          {membershipClasses.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </select>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={handleGenerateMissing}>
            Generate Missing
          </Button>
          <Button variant="outline" size="sm" onClick={handleSendReminders}>
            Send Reminders to Unpaid
          </Button>
        </div>
      </div>
    </div>
  );
}
