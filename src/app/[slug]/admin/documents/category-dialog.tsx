"use client";

import { useState, useTransition } from "react";
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
  createDocumentCategory,
  updateDocumentCategory,
  deleteDocumentCategory,
} from "@/actions/documents/categories";
import { toast } from "sonner";
import { FolderOpen, Pencil, Trash2, Plus } from "lucide-react";

type Category = { id: string; name: string; description: string | null; sortOrder: number };

export function CategoryDialog({
  organisationId,
  slug,
  categories,
}: {
  organisationId: string;
  slug: string;
  categories: Category[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function handleCreate() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const result = await createDocumentCategory({
        organisationId,
        name: newName.trim(),
        sortOrder: categories.length,
        slug,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to create category");
        return;
      }
      toast.success("Category created");
      setNewName("");
      router.refresh();
    });
  }

  function handleUpdate(id: string) {
    if (!editName.trim()) return;
    startTransition(async () => {
      const result = await updateDocumentCategory({
        id,
        organisationId,
        name: editName.trim(),
        slug,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to update category");
        return;
      }
      toast.success("Category updated");
      setEditingId(null);
      router.refresh();
    });
  }

  function handleDelete(cat: Category) {
    if (!confirm(`Delete "${cat.name}"? Documents in this category will become uncategorized.`)) return;
    startTransition(async () => {
      const result = await deleteDocumentCategory({
        id: cat.id,
        organisationId,
        slug,
      });
      if (!result.success) {
        toast.error(result.error ?? "Failed to delete category");
        return;
      }
      toast.success("Category deleted");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <FolderOpen className="h-4 w-4 mr-1.5" />
        Categories
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Existing categories */}
          <div className="space-y-2">
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No categories yet.</p>
            ) : (
              categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2">
                  {editingId === cat.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1"
                        onKeyDown={(e) => e.key === "Enter" && handleUpdate(cat.id)}
                      />
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(cat.id)}
                        disabled={isPending}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{cat.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(cat.id);
                          setEditName(cat.name);
                        }}
                        disabled={isPending}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(cat)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Add new category */}
          <div className="flex items-end gap-2 pt-2 border-t">
            <div className="flex-1 space-y-1">
              <Label htmlFor="new-cat-name" className="text-xs">New Category</Label>
              <Input
                id="new-cat-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Category name"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <Button onClick={handleCreate} disabled={isPending || !newName.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
