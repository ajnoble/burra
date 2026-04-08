"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateGstSettings } from "@/actions/organisations/update-gst";
import { toast } from "sonner";

type GstSettingsFormProps = {
  organisationId: string;
  slug: string;
  gstEnabled: boolean;
  gstRateBps: number;
  abnNumber: string | null;
};

export function GstSettingsForm({
  organisationId,
  slug,
  gstEnabled: initialGstEnabled,
  gstRateBps,
  abnNumber: initialAbn,
}: GstSettingsFormProps) {
  const [saving, setSaving] = useState(false);
  const [gstEnabled, setGstEnabled] = useState(initialGstEnabled);
  const [abnNumber, setAbnNumber] = useState(initialAbn ?? "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    try {
      const result = await updateGstSettings({
        organisationId,
        gstEnabled,
        abnNumber,
        slug,
      });

      if (result.success) {
        toast.success("GST settings saved");
      } else {
        toast.error(result.error ?? "Failed to save GST settings");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save GST settings"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>GST / Tax</CardTitle>
        <CardDescription>
          Configure GST for your organisation. All prices are treated as GST-inclusive.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="gstEnabled"
              checked={gstEnabled}
              onCheckedChange={setGstEnabled}
            />
            <Label htmlFor="gstEnabled">Enable GST</Label>
          </div>
          {gstEnabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="abnNumber">ABN</Label>
                <Input
                  id="abnNumber"
                  value={abnNumber}
                  onChange={(e) => setAbnNumber(e.target.value)}
                  placeholder="51 824 753 556"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Your Australian Business Number (11 digits)
                </p>
              </div>
              <div className="space-y-2">
                <Label>GST Rate</Label>
                <Input
                  value={`${gstRateBps / 100}%`}
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  Standard Australian GST rate
                </p>
              </div>
            </>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save GST Settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
