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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  createCustomField,
  updateCustomField,
  toggleCustomField,
} from "@/actions/custom-fields/manage";
import { toast } from "sonner";

type CustomField = {
  id: string;
  organisationId: string;
  name: string;
  key: string;
  type: string;
  options: string | null;
  sortOrder: number;
  isRequired: boolean;
  isActive: boolean;
};

function nameToKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function CustomFieldManager({
  organisationId,
  initialFields,
}: {
  organisationId: string;
  initialFields: CustomField[];
}) {
  const params = useParams();
  const slug = params.slug as string;
  const [fields, setFields] = useState(initialFields);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState("text");
  const [keyValue, setKeyValue] = useState("");
  const [isRequired, setIsRequired] = useState(false);

  function openAdd() {
    setEditing(null);
    setSelectedType("text");
    setKeyValue("");
    setIsRequired(false);
    setDialogOpen(true);
  }

  function openEdit(field: CustomField) {
    setEditing(field);
    setSelectedType(field.type);
    setKeyValue(field.key);
    setIsRequired(field.isRequired);
    setDialogOpen(true);
  }

  function handleDialogClose(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      setEditing(null);
      setSelectedType("text");
      setKeyValue("");
      setIsRequired(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const name = form.get("name") as string;
    const key = form.get("key") as string;
    const type = selectedType;
    const options = form.get("options") as string;

    try {
      if (editing) {
        const updated = await updateCustomField({
          fieldId: editing.id,
          organisationId,
          name,
          key,
          type,
          options: type === "dropdown" ? options : undefined,
          isRequired,
          slug,
        });
        setFields((prev) =>
          prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f))
        );
        toast.success("Field updated");
      } else {
        const created = await createCustomField({
          organisationId,
          name,
          key,
          type,
          options: type === "dropdown" ? options : undefined,
          isRequired,
          slug,
        });
        setFields((prev) => [...prev, created]);
        toast.success("Field created");
      }
      setDialogOpen(false);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(field: CustomField) {
    try {
      await toggleCustomField(field.id, !field.isActive, slug);
      setFields((prev) =>
        prev.map((f) =>
          f.id === field.id ? { ...f, isActive: !f.isActive } : f
        )
      );
      toast.success(field.isActive ? "Field deactivated" : "Field activated");
    } catch {
      toast.error("Failed to update field");
    }
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <Card key={field.id}>
          <CardContent className="flex items-center justify-between py-3 px-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{field.name}</span>
                <Badge variant="secondary" className="text-xs">
                  {field.type}
                </Badge>
                {field.isRequired && (
                  <Badge variant="outline" className="text-xs">
                    Required
                  </Badge>
                )}
                {!field.isActive && (
                  <Badge variant="outline" className="text-xs">
                    Inactive
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Key: {field.key}
              </p>
              {field.options && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Options: {field.options}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEdit(field)}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggle(field)}
              >
                {field.isActive ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
      >
        <DialogTrigger
          render={<Button variant="outline" />}
          onClick={openAdd}
        >
          Add Field
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit" : "New"} Custom Field
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cf-name">Name</Label>
              <Input
                id="cf-name"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
                onChange={(e) => {
                  if (!editing) {
                    setKeyValue(nameToKey(e.target.value));
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cf-key">Key</Label>
              <Input
                id="cf-key"
                name="key"
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Auto-generated from name. Used in exports and integrations.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cf-type">Type</Label>
              <Select
                value={selectedType}
                onValueChange={(v) => setSelectedType(v ?? "text")}
              >
                <SelectTrigger id="cf-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="dropdown">Dropdown</SelectItem>
                  <SelectItem value="checkbox">Checkbox</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedType === "dropdown" && (
              <div className="space-y-2">
                <Label htmlFor="cf-options">Options</Label>
                <Input
                  id="cf-options"
                  name="options"
                  defaultValue={editing?.options ?? ""}
                  placeholder="Option 1, Option 2, Option 3"
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of options.
                </p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="cf-required"
                checked={isRequired}
                onCheckedChange={setIsRequired}
              />
              <Label htmlFor="cf-required">Required field</Label>
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
