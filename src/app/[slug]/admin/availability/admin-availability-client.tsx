"use client";

import { useRouter } from "next/navigation";
import { AvailabilityCalendar } from "./availability-calendar";
import { OverrideTable } from "./override-table";
import { OverrideForm } from "./override-form";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useState } from "react";

type Lodge = { id: string; name: string; totalBeds: number };
type Override = {
  id: string;
  startDate: string;
  endDate: string;
  type: string;
  bedReduction: number | null;
  reason: string | null;
};

type Props = {
  lodges: Lodge[];
  selectedLodgeId: string;
  availability: {
    date: string;
    totalBeds: number;
    bookedBeds: number;
    hasOverride: boolean;
  }[];
  overrides: Override[];
  year: number;
  month: number;
  slug: string;
};

export function AdminAvailabilityClient({
  lodges,
  selectedLodgeId,
  availability,
  overrides,
  year,
  month,
  slug,
}: Props) {
  const router = useRouter();
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingOverride, setEditingOverride] = useState<Override | null>(null);

  function handleLodgeChange(lodgeId: string) {
    const params = new URLSearchParams();
    params.set("lodge", lodgeId);
    params.set("year", String(year));
    params.set("month", String(month));
    router.push(`/${slug}/admin/availability?${params.toString()}`);
  }

  function handleMonthChange(newYear: number, newMonth: number) {
    const params = new URLSearchParams();
    params.set("lodge", selectedLodgeId);
    params.set("year", String(newYear));
    params.set("month", String(newMonth));
    router.push(`/${slug}/admin/availability?${params.toString()}`);
  }

  function handleDateClick(date: string) {
    setSelectedDate(date);
    setEditingOverride(null);
    setShowOverrideForm(true);
  }

  function handleEditOverride(override: Override) {
    setEditingOverride(override);
    setSelectedDate(null);
    setShowOverrideForm(true);
  }

  function handleFormClose() {
    setShowOverrideForm(false);
    setSelectedDate(null);
    setEditingOverride(null);
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
                  {lodge.name} ({lodge.totalBeds} beds)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <AvailabilityCalendar
        mode="admin"
        availability={availability}
        year={year}
        month={month}
        onMonthChange={handleMonthChange}
        onDateClick={handleDateClick}
      />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Overrides</h2>
          <Button
            size="sm"
            onClick={() => {
              setSelectedDate(null);
              setEditingOverride(null);
              setShowOverrideForm(true);
            }}
          >
            Add Override
          </Button>
        </div>
        <OverrideTable
          overrides={overrides}
          onEdit={handleEditOverride}
          slug={slug}
        />
      </div>

      {showOverrideForm && (
        <OverrideForm
          lodgeId={selectedLodgeId}
          slug={slug}
          initialDate={selectedDate}
          override={editingOverride}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
}
