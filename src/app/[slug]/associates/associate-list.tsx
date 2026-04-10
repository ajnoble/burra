"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAssociate, updateAssociate, deleteAssociate } from "@/actions/associates";
import { toast } from "sonner";

type Associate = {
  id: string;
  organisationId: string;
  ownerMemberId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type Props = {
  associates: Associate[];
  organisationId: string;
  slug: string;
};

function AssociateForm({
  associate,
  onSubmit,
  saving,
}: {
  associate?: Associate;
  onSubmit: (data: FormData) => Promise<void>;
  saving: boolean;
}) {
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit(new FormData(e.currentTarget));
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="assoc-first-name">First Name</Label>
          <Input
            id="assoc-first-name"
            name="firstName"
            defaultValue={associate?.firstName ?? ""}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="assoc-last-name">Last Name</Label>
          <Input
            id="assoc-last-name"
            name="lastName"
            defaultValue={associate?.lastName ?? ""}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="assoc-email">Email</Label>
        <Input
          id="assoc-email"
          name="email"
          type="email"
          defaultValue={associate?.email ?? ""}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="assoc-phone">Phone (optional)</Label>
        <Input
          id="assoc-phone"
          name="phone"
          type="tel"
          defaultValue={associate?.phone ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="assoc-dob">Date of Birth (optional)</Label>
        <Input
          id="assoc-dob"
          name="dateOfBirth"
          type="date"
          defaultValue={associate?.dateOfBirth ?? ""}
        />
      </div>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving..." : associate ? "Update" : "Add Associate"}
      </Button>
    </form>
  );
}

export function AssociateList({ associates: initial, organisationId, slug }: Props) {
  const [associates, setAssociates] = useState(initial);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Associate | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate(data: FormData) {
    setSaving(true);
    try {
      const result = await createAssociate({
        organisationId,
        slug,
        firstName: data.get("firstName") as string,
        lastName: data.get("lastName") as string,
        email: data.get("email") as string,
        phone: (data.get("phone") as string) || undefined,
        dateOfBirth: (data.get("dateOfBirth") as string) || undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Associate added");
      setAddOpen(false);
      // Reload to get fresh data from server
      window.location.reload();
    } catch {
      toast.error("Failed to add associate");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(data: FormData) {
    if (!editTarget) return;
    setSaving(true);
    try {
      const result = await updateAssociate({
        id: editTarget.id,
        organisationId,
        slug,
        firstName: data.get("firstName") as string,
        lastName: data.get("lastName") as string,
        email: data.get("email") as string,
        phone: (data.get("phone") as string) || undefined,
        dateOfBirth: (data.get("dateOfBirth") as string) || undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setAssociates((prev) =>
        prev.map((a) =>
          a.id === editTarget.id
            ? {
                ...a,
                firstName: data.get("firstName") as string,
                lastName: data.get("lastName") as string,
                email: data.get("email") as string,
                phone: (data.get("phone") as string) || null,
                dateOfBirth: (data.get("dateOfBirth") as string) || null,
              }
            : a
        )
      );
      toast.success("Associate updated");
      setEditTarget(null);
    } catch {
      toast.error("Failed to update associate");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(associate: Associate) {
    if (
      !confirm(
        `Remove ${associate.firstName} ${associate.lastName} as an associate? This cannot be undone.`
      )
    )
      return;

    try {
      const result = await deleteAssociate(associate.id, organisationId, slug);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setAssociates((prev) => prev.filter((a) => a.id !== associate.id));
      toast.success("Associate removed");
    } catch {
      toast.error("Failed to remove associate");
    }
  }

  return (
    <div className="space-y-4">
      {associates.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No associates yet. Add people you regularly bring as guests.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {associates.map((associate) => (
            <Card key={associate.id}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div>
                  <p className="font-medium text-sm">
                    {associate.firstName} {associate.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{associate.email}</p>
                  {associate.phone && (
                    <p className="text-xs text-muted-foreground">{associate.phone}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditTarget(associate)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleDelete(associate)}
                  >
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger render={<Button variant="outline" />}>
          Add Associate
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Associate</DialogTitle>
          </DialogHeader>
          <AssociateForm onSubmit={handleCreate} saving={saving} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Associate</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <AssociateForm
              associate={editTarget}
              onSubmit={handleUpdate}
              saving={saving}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
