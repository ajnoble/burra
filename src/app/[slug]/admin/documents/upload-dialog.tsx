"use client";

import { useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadDocument } from "@/actions/documents/upload";
import { toast } from "sonner";
import { Upload } from "lucide-react";

type Props = {
  organisationId: string;
  slug: string;
  categories: Array<{ id: string; name: string }>;
};

export function UploadDialog({ organisationId, slug, categories }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accessLevel, setAccessLevel] = useState("MEMBER");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && !title) {
      setTitle(file.name.replace(/\.[^.]+$/, ""));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    formData.set("organisationId", organisationId);
    formData.set("slug", slug);
    formData.set("accessLevel", accessLevel);
    if (categoryId) formData.set("categoryId", categoryId);

    try {
      const result = await uploadDocument(formData);
      if (!result.success) {
        toast.error(result.error ?? "Upload failed");
        return;
      }
      toast.success("Document uploaded");
      setOpen(false);
      setTitle("");
      setCategoryId("");
      setAccessLevel("MEMBER");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Upload className="h-4 w-4 mr-1.5" />
        Upload Document
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-file">File</Label>
            <Input
              id="doc-file"
              name="file"
              type="file"
              required
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.csv"
              onChange={handleFileChange}
            />
            <p className="text-xs text-muted-foreground">
              Max 10 MB. PDF, Word, Excel, PNG, JPG, CSV.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-title">Title</Label>
            <Input
              id="doc-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-description">Description (optional)</Label>
            <Textarea
              id="doc-description"
              name="description"
              placeholder="Brief description"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-category">Category</Label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
              <SelectTrigger id="doc-category">
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
            <Label htmlFor="doc-access">Access Level</Label>
            <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v ?? "MEMBER")}>
              <SelectTrigger id="doc-access">
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

          <Button type="submit" disabled={saving || !title}>
            {saving ? "Uploading..." : "Upload"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
