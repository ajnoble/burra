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
  createChargeCategory,
  updateChargeCategory,
  toggleChargeCategory,
} from "@/actions/charge-categories";
import { toast } from "sonner";

type ChargeCategory = {
  id: string;
  organisationId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export function ChargeCategoryManager({
  organisationId,
  initialCategories,
}: {
  organisationId: string;
  initialCategories: ChargeCategory[];
}) {
  const params = useParams();
  const slug = params.slug as string;
  const [categories, setCategories] = useState(initialCategories);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChargeCategory | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const name = form.get("name") as string;
    const description = form.get("description") as string;

    try {
      if (editing) {
        const updated = await updateChargeCategory({
          id: editing.id,
          organisationId,
          name,
          description,
          sortOrder: editing.sortOrder,
          slug,
        });
        setCategories((prev) =>
          prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
        );
        toast.success("Category updated");
      } else {
        const created = await createChargeCategory({
          organisationId,
          name,
          description,
          sortOrder: categories.length,
          slug,
        });
        setCategories((prev) => [...prev, created]);
        toast.success("Category created");
      }
      setDialogOpen(false);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(cat: ChargeCategory) {
    try {
      await toggleChargeCategory(cat.id, !cat.isActive, slug);
      setCategories((prev) =>
        prev.map((c) =>
          c.id === cat.id ? { ...c, isActive: !c.isActive } : c
        )
      );
      toast.success(cat.isActive ? "Category deactivated" : "Category activated");
    } catch {
      toast.error("Failed to update category");
    }
  }

  return (
    <div className="space-y-3">
      {categories.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No charge categories yet. Add one to start creating charges.
        </p>
      )}
      {categories.map((cat) => (
        <Card key={cat.id}>
          <CardContent className="flex items-center justify-between py-3 px-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{cat.name}</span>
                {!cat.isActive && (
                  <Badge variant="outline" className="text-xs">
                    Inactive
                  </Badge>
                )}
              </div>
              {cat.description && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cat.description}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(cat);
                  setDialogOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggle(cat)}
              >
                {cat.isActive ? "Deactivate" : "Activate"}
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
          Add Category
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit" : "New"} Charge Category
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cc-name">Name</Label>
              <Input
                id="cc-name"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-desc">Description (optional)</Label>
              <Input
                id="cc-desc"
                name="description"
                defaultValue={editing?.description ?? ""}
              />
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
