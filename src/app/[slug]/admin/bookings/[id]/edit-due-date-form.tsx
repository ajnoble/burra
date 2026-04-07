"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateBookingDueDate } from "@/actions/bookings/update-due-date";
import { toast } from "sonner";

type Props = {
  bookingId: string;
  organisationId: string;
  currentDueDate: string | null;
  slug: string;
};

export function EditDueDateForm({
  bookingId,
  organisationId,
  currentDueDate,
  slug,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dueDate, setDueDate] = useState(currentDueDate ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateBookingDueDate({
        bookingId,
        organisationId,
        balanceDueDate: dueDate || null,
        slug,
      });
      if (result.success) {
        toast.success("Payment due date updated");
        setEditing(false);
      } else {
        toast.error(result.error ?? "Failed to update");
      }
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
        {currentDueDate ? "Edit" : "Set due date"}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="w-40"
      />
      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setDueDate(currentDueDate ?? "");
          setEditing(false);
        }}
      >
        Cancel
      </Button>
    </div>
  );
}
