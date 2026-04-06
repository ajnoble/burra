"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateMember } from "@/actions/members/update";

type MembershipClass = { id: string; name: string };

type MemberData = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  memberNumber: string | null;
  membershipClassId: string;
  notes: string | null;
};

export function MemberProfileForm({
  member,
  organisationId,
  slug,
  membershipClasses,
}: {
  member: MemberData;
  organisationId: string;
  slug: string;
  membershipClasses: MembershipClass[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setPending(true);

    const form = new FormData(e.currentTarget);

    const result = await updateMember({
      memberId: member.id,
      organisationId,
      slug,
      firstName: form.get("firstName") as string,
      lastName: form.get("lastName") as string,
      email: form.get("email") as string,
      phone: (form.get("phone") as string) || undefined,
      dateOfBirth: (form.get("dateOfBirth") as string) || undefined,
      memberNumber: (form.get("memberNumber") as string) || undefined,
      membershipClassId: form.get("membershipClassId") as string,
      notes: (form.get("notes") as string) || undefined,
    });

    setPending(false);
    if (result.success) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError(result.error ?? "Failed to update");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
          Saved successfully.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name</Label>
          <Input id="firstName" name="firstName" defaultValue={member.firstName} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name</Label>
          <Input id="lastName" name="lastName" defaultValue={member.lastName} required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={member.email} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={member.phone ?? ""} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dateOfBirth">Date of Birth</Label>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={member.dateOfBirth ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="memberNumber">Member Number</Label>
          <Input id="memberNumber" name="memberNumber" defaultValue={member.memberNumber ?? ""} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="membershipClassId">Membership Class</Label>
        <select
          id="membershipClassId"
          name="membershipClassId"
          defaultValue={member.membershipClassId}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          {membershipClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (admin only)</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={member.notes ?? ""} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
