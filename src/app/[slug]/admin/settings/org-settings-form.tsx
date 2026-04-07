"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateOrganisation } from "@/actions/organisations/update";
import { toast } from "sonner";

type Org = {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  address: string | null;
  timezone: string;
  subscriptionGraceDays: number;
  bookingPaymentGraceDays: number;
  bookingPaymentReminderDays: number[];
};

export function OrgSettingsForm({ org }: { org: Org }) {
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.currentTarget);

    try {
      await updateOrganisation({
        id: org.id,
        name: form.get("name") as string,
        contactEmail: form.get("contactEmail") as string,
        contactPhone: form.get("contactPhone") as string,
        websiteUrl: form.get("websiteUrl") as string,
        address: form.get("address") as string,
        timezone: form.get("timezone") as string,
        subscriptionGraceDays: parseInt(form.get("subscriptionGraceDays") as string, 10),
        bookingPaymentGraceDays: parseInt(form.get("bookingPaymentGraceDays") as string, 10),
        bookingPaymentReminderDays: (form.get("bookingPaymentReminderDays") as string)
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n)),
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save settings"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>
          Manage your club&apos;s details. Slug: <code>{org.slug}</code>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Club Name</Label>
            <Input id="name" name="name" defaultValue={org.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactEmail">Contact Email</Label>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              defaultValue={org.contactEmail ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPhone">Contact Phone</Label>
            <Input
              id="contactPhone"
              name="contactPhone"
              defaultValue={org.contactPhone ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="websiteUrl">Website</Label>
            <Input
              id="websiteUrl"
              name="websiteUrl"
              type="url"
              defaultValue={org.websiteUrl ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              name="address"
              defaultValue={org.address ?? ""}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              name="timezone"
              defaultValue={org.timezone}
              required
            />
            <p className="text-xs text-muted-foreground">
              e.g. Australia/Melbourne, Australia/Sydney
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subscriptionGraceDays">Subscription Grace Period (days)</Label>
            <Input
              id="subscriptionGraceDays"
              name="subscriptionGraceDays"
              type="number"
              min="0"
              max="90"
              defaultValue={org.subscriptionGraceDays}
              required
            />
            <p className="text-xs text-muted-foreground">
              Days after subscription due date before marking members as non-financial
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bookingPaymentGraceDays">Booking Payment Grace Period (days)</Label>
            <Input
              id="bookingPaymentGraceDays"
              name="bookingPaymentGraceDays"
              type="number"
              min="0"
              max="90"
              defaultValue={org.bookingPaymentGraceDays}
              required
            />
            <p className="text-xs text-muted-foreground">
              Days after payment due date before auto-cancelling unpaid bookings
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bookingPaymentReminderDays">Payment Reminder Schedule</Label>
            <Input
              id="bookingPaymentReminderDays"
              name="bookingPaymentReminderDays"
              defaultValue={org.bookingPaymentReminderDays.join(", ")}
              required
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated days before due date to send payment reminders (e.g. 7, 1)
            </p>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
