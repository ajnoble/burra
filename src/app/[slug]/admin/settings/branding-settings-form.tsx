"use client";

import { useState, useTransition } from "react";
import { updateBranding } from "@/actions/organisations/updateBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Props = {
  organisationId: string;
  initial: {
    accentColor: string | null;
    logoUrl: string | null;
  };
};

const DEFAULT_PREVIEW_COLOR = "#38694a";

export function BrandingSettingsForm({ organisationId, initial }: Props) {
  const [accentColor, setAccentColor] = useState<string>(
    initial.accentColor ?? DEFAULT_PREVIEW_COLOR
  );
  const [useDefault, setUseDefault] = useState<boolean>(initial.accentColor === null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateBranding(
        organisationId,
        {
          accentColor: useDefault ? null : accentColor,
          removeLogo,
        },
        logoFile
      );
      if (result.success) {
        toast.success("Branding updated");
        setLogoFile(null);
        setRemoveLogo(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Accent color</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => {
                  setAccentColor(e.target.value);
                  setUseDefault(false);
                }}
                disabled={useDefault}
                className="h-10 w-16 cursor-pointer rounded border border-input"
                aria-label="Accent color picker"
              />
              <Input
                type="text"
                value={accentColor}
                onChange={(e) => {
                  setAccentColor(e.target.value);
                  setUseDefault(false);
                }}
                disabled={useDefault}
                placeholder="#38694a"
                pattern="^#[0-9a-fA-F]{6}$"
                className="w-32 font-mono"
                aria-label="Accent color hex"
              />
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={useDefault}
                  onChange={(e) => setUseDefault(e.target.checked)}
                />
                Use Snow Gum default
              </label>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-md border border-border bg-card p-3">
              <span className="text-xs text-muted-foreground">Preview:</span>
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: useDefault ? undefined : accentColor }}
                disabled
              >
                {useDefault ? "Default" : "Your color"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo">Club logo</Label>
            {initial.logoUrl && !removeLogo && (
              <div className="flex items-center gap-3">
                <img
                  src={initial.logoUrl}
                  alt="Current logo"
                  className="h-12 w-auto max-w-[160px] rounded border border-border object-contain p-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRemoveLogo(true)}
                >
                  Remove logo
                </Button>
              </div>
            )}
            {removeLogo && (
              <p className="text-sm text-muted-foreground">
                Logo will be removed on save.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setRemoveLogo(false)}
                >
                  Undo
                </button>
              </p>
            )}
            <Input
              id="logo"
              type="file"
              accept="image/png,image/svg+xml,image/jpeg"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              PNG, SVG, or JPEG. Max 500KB. Upload pre-cropped — no cropping tool provided.
            </p>
          </div>

          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save branding"}
          </Button>

          <p className="text-xs text-muted-foreground">
            These settings affect how your club appears to members. Snow Gum&apos;s
            wordmark still appears in the footer.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
