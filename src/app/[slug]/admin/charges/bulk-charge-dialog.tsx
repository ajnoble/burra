"use client";

import { useState } from "react";
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
import { bulkCreateCharges } from "@/actions/charges/bulk-create";
import { toast } from "sonner";

type Props = {
  organisationId: string;
  slug: string;
  categories: Array<{ id: string; name: string }>;
  members: Array<{ id: string; firstName: string; lastName: string }>;
  sessionMemberId: string;
};

export function BulkChargeDialog({
  organisationId,
  slug,
  categories,
  members,
  sessionMemberId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleMember(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(members.map((m) => m.id)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  function handleOpenChange(value: boolean) {
    setOpen(value);
    if (!value) {
      setCategoryId("");
      setSelected(new Set());
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.currentTarget);
    const amountStr = form.get("amount") as string;
    const amountCents = Math.round(parseFloat(amountStr) * 100);
    const description = (form.get("description") as string) || undefined;
    const dueDate = (form.get("dueDate") as string) || undefined;

    try {
      const result = await bulkCreateCharges({
        organisationId,
        memberIds: Array.from(selected),
        categoryId,
        amountCents,
        description,
        dueDate,
        createdByMemberId: sessionMemberId,
        slug,
      });

      if (!result.success) {
        toast.error(result.error ?? "Failed to create charges");
        return;
      }

      toast.success(`${result.count} charge${result.count === 1 ? "" : "s"} created`);
      handleOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create charges");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" />}>
        Bulk Charge
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk Charge</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulk-category">Category</Label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")} required>
              <SelectTrigger id="bulk-category">
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
            <Label htmlFor="bulk-amount">Amount (AUD)</Label>
            <Input
              id="bulk-amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-description">Description (optional)</Label>
            <Input
              id="bulk-description"
              name="description"
              placeholder="Optional description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-due-date">Due Date (optional)</Label>
            <Input
              id="bulk-due-date"
              name="dueDate"
              type="date"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Members</Label>
              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  All
                </button>
                <span className="text-muted-foreground">/</span>
                <button
                  type="button"
                  onClick={selectNone}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  None
                </button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted">
                  <input
                    type="checkbox"
                    id={`bulk-member-${m.id}`}
                    checked={selected.has(m.id)}
                    onChange={() => toggleMember(m.id)}
                    className="h-4 w-4 rounded border-gray-300 text-primary accent-primary cursor-pointer"
                  />
                  <label
                    htmlFor={`bulk-member-${m.id}`}
                    className="text-sm cursor-pointer flex-1"
                  >
                    {m.lastName}, {m.firstName}
                  </label>
                </div>
              ))}
              {members.length === 0 && (
                <p className="text-sm text-muted-foreground px-2 py-1">No members found</p>
              )}
            </div>
          </div>

          <Button
            type="submit"
            disabled={saving || !categoryId || selected.size === 0}
          >
            {saving
              ? "Creating..."
              : `Create Charges (${selected.size} member${selected.size === 1 ? "" : "s"})`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
