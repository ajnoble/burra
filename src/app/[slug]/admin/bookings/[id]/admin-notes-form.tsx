"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateAdminNotes } from "@/actions/bookings/admin-notes";
import { toast } from "sonner";

type Props = {
  bookingId: string;
  organisationId: string;
  initialNotes: string;
  slug: string;
};

export function AdminNotesForm({ bookingId, organisationId, initialNotes, slug }: Props) {
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateAdminNotes({ bookingId, organisationId, notes, slug });
      if (result.success) {
        toast.success("Admin notes saved");
      } else {
        toast.error(result.error ?? "Failed to save notes");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save notes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h3 className="font-semibold">Admin Notes</h3>
      <div className="space-y-2">
        <Label htmlFor="admin-notes">Internal notes (not visible to members)</Label>
        <Textarea
          id="admin-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Add internal notes about this booking..."
        />
      </div>
      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving ? "Saving..." : "Save Notes"}
      </Button>
    </div>
  );
}
