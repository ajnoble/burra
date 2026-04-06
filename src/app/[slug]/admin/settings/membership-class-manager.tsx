"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createMembershipClass,
  updateMembershipClass,
  toggleMembershipClass,
} from "@/actions/membership-classes";
import { toast } from "sonner";

type MembershipClass = {
  id: string;
  organisationId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  annualFeeCents: number | null;
};

export function MembershipClassManager({
  organisationId,
  initialClasses,
}: {
  organisationId: string;
  initialClasses: MembershipClass[];
}) {
  const params = useParams();
  const slug = params.slug as string;
  const [classes, setClasses] = useState(initialClasses);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MembershipClass | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const name = form.get("name") as string;
    const description = form.get("description") as string;
    const feeValue = form.get("annualFee") as string;
    const annualFeeCents = feeValue ? Math.round(parseFloat(feeValue) * 100) : null;

    try {
      if (editing) {
        const updated = await updateMembershipClass({
          id: editing.id,
          organisationId,
          name,
          description,
          sortOrder: editing.sortOrder,
          annualFeeCents,
          slug,
        });
        setClasses((prev) =>
          prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
        );
        toast.success("Class updated");
      } else {
        const created = await createMembershipClass({
          organisationId,
          name,
          description,
          sortOrder: classes.length,
          annualFeeCents,
          slug,
        });
        setClasses((prev) => [...prev, created]);
        toast.success("Class created");
      }
      setDialogOpen(false);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(cls: MembershipClass) {
    try {
      await toggleMembershipClass(cls.id, !cls.isActive, slug);
      setClasses((prev) =>
        prev.map((c) =>
          c.id === cls.id ? { ...c, isActive: !c.isActive } : c
        )
      );
      toast.success(cls.isActive ? "Class deactivated" : "Class activated");
    } catch {
      toast.error("Failed to update class");
    }
  }

  return (
    <div className="space-y-3">
      {classes.map((cls) => (
        <Card key={cls.id}>
          <CardContent className="flex items-center justify-between py-3 px-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{cls.name}</span>
                {!cls.isActive && (
                  <Badge variant="outline" className="text-xs">
                    Inactive
                  </Badge>
                )}
              </div>
              {cls.description && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cls.description}
                </p>
              )}
              {cls.annualFeeCents !== null && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Annual fee: ${(cls.annualFeeCents / 100).toFixed(2)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(cls);
                  setDialogOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggle(cls)}
              >
                {cls.isActive ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogTrigger
          render={<Button variant="outline" />}
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          Add Class
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit" : "New"} Membership Class
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mc-name">Name</Label>
              <Input
                id="mc-name"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mc-desc">Description (optional)</Label>
              <Input
                id="mc-desc"
                name="description"
                defaultValue={editing?.description ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mc-fee">Annual Fee (AUD)</Label>
              <Input
                id="mc-fee"
                name="annualFee"
                type="number"
                step="0.01"
                min="0"
                placeholder="No fee"
                defaultValue={
                  editing?.annualFeeCents
                    ? (editing.annualFeeCents / 100).toFixed(2)
                    : ""
                }
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for no annual fee (e.g. honorary members)
              </p>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : editing ? "Update" : "Create"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
