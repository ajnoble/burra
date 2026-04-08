"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { updateSmsSettings } from "@/actions/communications/settings";

type Props = {
  organisationId: string;
  slug: string;
  smsFromNumber: string | null;
  smsPreArrivalEnabled: boolean;
  smsPreArrivalHours: number;
  smsPaymentReminderEnabled: boolean;
};

export function SmsSettingsForm({
  organisationId,
  slug,
  smsFromNumber,
  smsPreArrivalEnabled: initialPreArrival,
  smsPreArrivalHours: initialHours,
  smsPaymentReminderEnabled: initialPaymentReminder,
}: Props) {
  const router = useRouter();
  const [preArrivalEnabled, setPreArrivalEnabled] = useState(initialPreArrival);
  const [preArrivalHours, setPreArrivalHours] = useState(initialHours);
  const [paymentReminderEnabled, setPaymentReminderEnabled] = useState(
    initialPaymentReminder
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateSmsSettings({
        organisationId,
        smsPreArrivalEnabled: preArrivalEnabled,
        smsPreArrivalHours: preArrivalHours,
        smsPaymentReminderEnabled: paymentReminderEnabled,
        slug,
      });
      if (result.success) {
        toast.success("SMS settings updated");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to update settings");
      }
    } catch {
      toast.error("Failed to update settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold mb-4">SMS Settings</h2>
      </div>

      <div>
        <Label>SMS Phone Number</Label>
        <p className="text-sm text-muted-foreground mt-1">
          {smsFromNumber || "No SMS number configured. Contact support to set up SMS."}
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="pre-arrival"
            checked={preArrivalEnabled}
            onChange={(e) => setPreArrivalEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <Label htmlFor="pre-arrival" className="font-normal">
            Send pre-arrival SMS reminders
          </Label>
        </div>
        {preArrivalEnabled && (
          <div className="ml-7">
            <Label htmlFor="pre-arrival-hours">Hours before arrival</Label>
            <Input
              id="pre-arrival-hours"
              type="number"
              min={1}
              max={168}
              value={preArrivalHours}
              onChange={(e) => setPreArrivalHours(Number(e.target.value))}
              className="w-24 mt-1"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="payment-reminder"
          checked={paymentReminderEnabled}
          onChange={(e) => setPaymentReminderEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <Label htmlFor="payment-reminder" className="font-normal">
          Send payment reminder SMS
        </Label>
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
