"use client";

import { useRouter } from "next/navigation";
import { AvailabilityCalendar } from "@/app/[slug]/admin/availability/availability-calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Lodge = { id: string; name: string; totalBeds: number };

type Props = {
  lodges: Lodge[];
  selectedLodgeId: string;
  availability: {
    date: string;
    totalBeds: number;
    bookedBeds: number;
    hasOverride: boolean;
  }[];
  year: number;
  month: number;
  slug: string;
};

export function MemberAvailabilityClient({
  lodges,
  selectedLodgeId,
  availability,
  year,
  month,
  slug,
}: Props) {
  const router = useRouter();

  function handleLodgeChange(lodgeId: string | null) {
    if (!lodgeId) return;
    const params = new URLSearchParams();
    params.set("lodge", lodgeId);
    params.set("year", String(year));
    params.set("month", String(month));
    router.push(`/${slug}/availability?${params.toString()}`);
  }

  function handleMonthChange(newYear: number, newMonth: number) {
    const params = new URLSearchParams();
    params.set("lodge", selectedLodgeId);
    params.set("year", String(newYear));
    params.set("month", String(newMonth));
    router.push(`/${slug}/availability?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      {lodges.length > 1 && (
        <div className="w-64">
          <Select value={selectedLodgeId} onValueChange={handleLodgeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select lodge" />
            </SelectTrigger>
            <SelectContent>
              {lodges.map((lodge) => (
                <SelectItem key={lodge.id} value={lodge.id}>
                  {lodge.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <AvailabilityCalendar
        mode="member"
        availability={availability}
        year={year}
        month={month}
        onMonthChange={handleMonthChange}
      />

      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-green-200 dark:bg-green-900" />
          Available
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-amber-200 dark:bg-amber-900" />
          Limited
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-red-200 dark:bg-red-900" />
          Unavailable
        </div>
      </div>
    </div>
  );
}
