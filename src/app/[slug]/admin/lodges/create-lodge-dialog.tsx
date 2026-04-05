"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createLodge } from "@/actions/lodges";
import { toast } from "sonner";

export function CreateLodgeDialog({
  organisationId,
}: {
  organisationId: string;
}) {
  const params = useParams();
  const slug = params.slug as string;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);

    try {
      await createLodge({
        organisationId,
        name: form.get("name") as string,
        address: form.get("address") as string,
        description: form.get("description") as string,
        totalBeds: parseInt(form.get("totalBeds") as string, 10),
        slug,
      });
      toast.success("Lodge created");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create lodge");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add Lodge</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Lodge</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lodge-name">Name</Label>
            <Input id="lodge-name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lodge-address">Address</Label>
            <Input id="lodge-address" name="address" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lodge-desc">Description</Label>
            <Textarea id="lodge-desc" name="description" rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lodge-beds">Total Beds</Label>
            <Input
              id="lodge-beds"
              name="totalBeds"
              type="number"
              min={1}
              required
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create Lodge"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
