"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createMember } from "@/actions/members/create";

type MembershipClass = { id: string; name: string };

export function MemberForm({
  organisationId,
  slug,
  membershipClasses,
}: {
  organisationId: string;
  slug: string;
  membershipClasses: MembershipClass[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(e.currentTarget);

    const result = await createMember({
      organisationId,
      slug,
      firstName: form.get("firstName") as string,
      lastName: form.get("lastName") as string,
      email: form.get("email") as string,
      membershipClassId: form.get("membershipClassId") as string,
      phone: (form.get("phone") as string) || undefined,
      dateOfBirth: (form.get("dateOfBirth") as string) || undefined,
      memberNumber: (form.get("memberNumber") as string) || undefined,
      notes: (form.get("notes") as string) || undefined,
      role: (form.get("role") as "MEMBER" | "BOOKING_OFFICER" | "COMMITTEE" | "ADMIN") || "MEMBER",
      isFinancial: form.get("isFinancial") === "on",
    });

    setPending(false);
    if (result && !result.success) {
      setError(result.error ?? "Failed to create member");
    }
    // On success, createMember redirects — no action needed here
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name *</Label>
          <Input id="firstName" name="firstName" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name *</Label>
          <Input id="lastName" name="lastName" required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email *</Label>
        <Input id="email" name="email" type="email" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dateOfBirth">Date of Birth</Label>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="memberNumber">Member Number</Label>
          <Input id="memberNumber" name="memberNumber" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="membershipClassId">Membership Class *</Label>
        <select
          id="membershipClassId"
          name="membershipClassId"
          required
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="">Select a class...</option>
          {membershipClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <select
          id="role"
          name="role"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="MEMBER">Member</option>
          <option value="BOOKING_OFFICER">Booking Officer</option>
          <option value="COMMITTEE">Committee</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isFinancial"
          name="isFinancial"
          defaultChecked
          className="h-4 w-4 rounded border-input"
        />
        <Label htmlFor="isFinancial">Financial (dues paid)</Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create Member"}
      </Button>
    </form>
  );
}
