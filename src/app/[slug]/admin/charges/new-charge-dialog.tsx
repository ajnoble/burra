"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCharge } from "@/actions/charges/create";
import { toast } from "sonner";

type Props = {
  organisationId: string;
  slug: string;
  categories: Array<{ id: string; name: string }>;
  members: Array<{ id: string; firstName: string; lastName: string }>;
  preselectedMemberId?: string;
  sessionMemberId: string;
};

export function NewChargeDialog({
  organisationId,
  slug,
  categories,
  members,
  preselectedMemberId,
  sessionMemberId,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [memberId, setMemberId] = useState(preselectedMemberId ?? "");
  const [categoryId, setCategoryId] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.currentTarget);
    const amountStr = form.get("amount") as string;
    const amountCents = Math.round(parseFloat(amountStr) * 100);
    const description = (form.get("description") as string) || undefined;
    const dueDate = (form.get("dueDate") as string) || undefined;

    try {
      const result = await createCharge({
        organisationId,
        memberId,
        categoryId,
        description,
        amountCents,
        dueDate,
        createdByMemberId: sessionMemberId,
        slug,
      });

      if (!result.success) {
        toast.error(result.error ?? "Failed to create charge");
        return;
      }

      toast.success("Charge created");
      setOpen(false);
      setMemberId(preselectedMemberId ?? "");
      setCategoryId("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create charge");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        New Charge
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Charge</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!preselectedMemberId && (
            <div className="space-y-2">
              <Label htmlFor="charge-member">Member</Label>
              <Select value={memberId} onValueChange={(v) => setMemberId(v ?? "")} required>
                <SelectTrigger id="charge-member">
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.lastName}, {m.firstName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="charge-category">Category</Label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")} required>
              <SelectTrigger id="charge-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="charge-amount">Amount (AUD)</Label>
            <Input
              id="charge-amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="charge-description">Description (optional)</Label>
            <Input
              id="charge-description"
              name="description"
              placeholder="Optional description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="charge-due-date">Due Date (optional)</Label>
            <Input
              id="charge-due-date"
              name="dueDate"
              type="date"
            />
          </div>

          <Button
            type="submit"
            disabled={saving || !memberId || !categoryId}
          >
            {saving ? "Creating..." : "Create Charge"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
