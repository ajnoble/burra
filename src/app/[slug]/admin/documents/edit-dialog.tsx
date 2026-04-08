"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateDocument, replaceFile } from "@/actions/documents/update";
import { toast } from "sonner";
import type { DocumentRow } from "./documents-table";

type Props = {
  document: DocumentRow | null;
  organisationId: string;
  slug: string;
  categories: Array<{ id: string; name: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditDialog({
  document: doc,
  organisationId,
  slug,
  categories,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accessLevel, setAccessLevel] = useState("MEMBER");

  useEffect(() => {
    if (doc) {
      setTitle(doc.documents.title);
      setDescription(doc.documents.description ?? "");
      setCategoryId(doc.documents.categoryId ?? "");
      setAccessLevel(doc.documents.accessLevel);
    }
  }, [doc]);

  async function handleSave() {
    if (!doc) return;
    setSaving(true);
    try {
      const result = await updateDocument({
        documentId: doc.documents.id,
        organisationId,
        title,
        description: description || null,
        categoryId: categoryId || null,
        accessLevel,
        slug,
      });
      if (!result.success) {
        toast.error(result.error ?? "Update failed");
        return;
      }
      toast.success("Document updated");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleReplaceFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!doc || !e.target.files?.[0]) return;
    setReplacing(true);
    const fd = new FormData();
    fd.set("file", e.target.files[0]);
    fd.set("documentId", doc.documents.id);
    fd.set("organisationId", organisationId);
    fd.set("slug", slug);
    try {
      const result = await replaceFile(fd);
      if (!result.success) {
        toast.error(result.error ?? "Replace failed");
        return;
      }
      toast.success("File replaced");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Replace failed");
    } finally {
      setReplacing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-category">Category</Label>
            <Select value={categoryId} onValueChange={(v: string | null) => setCategoryId(v ?? "")}>
              <SelectTrigger id="edit-category">
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Uncategorized</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-access">Access Level</Label>
            <Select value={accessLevel} onValueChange={(v: string | null) => setAccessLevel(v ?? "MEMBER")}>
              <SelectTrigger id="edit-access">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">Public</SelectItem>
                <SelectItem value="MEMBER">Members</SelectItem>
                <SelectItem value="COMMITTEE">Committee</SelectItem>
                <SelectItem value="ADMIN">Admin Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-replace">Replace File</Label>
            <Input
              id="edit-replace"
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.csv"
              onChange={handleReplaceFile}
              disabled={replacing}
            />
            {replacing && <p className="text-xs text-muted-foreground">Replacing file...</p>}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !title}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
