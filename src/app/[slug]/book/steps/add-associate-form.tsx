"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAssociate } from "@/actions/associates";

type Props = {
  organisationId: string;
  slug: string;
  onAdded: (id: string, firstName: string, lastName: string) => void;
  onCancel: () => void;
};

export function AddAssociateForm({
  organisationId,
  slug,
  onAdded,
  onCancel,
}: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [saveForFuture, setSaveForFuture] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await createAssociate({
        organisationId,
        slug,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      onAdded(result.id, firstName.trim(), lastName.trim());
    } catch {
      setError("Failed to save associate. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border p-4 space-y-3 bg-muted/20">
      <h3 className="font-medium text-sm">Add New Associate</h3>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            First Name <span className="text-destructive">*</span>
          </label>
          <Input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            required
            disabled={submitting}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Last Name <span className="text-destructive">*</span>
          </label>
          <Input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            required
            disabled={submitting}
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Email <span className="text-destructive">*</span>
        </label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          required
          disabled={submitting}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Phone (optional)
          </label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+61 4xx xxx xxx"
            disabled={submitting}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Date of Birth (optional)
          </label>
          <Input
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            disabled={submitting}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={saveForFuture}
          onChange={(e) => setSaveForFuture(e.target.checked)}
          disabled={submitting}
          className="rounded border-gray-300"
        />
        Save for future bookings
      </label>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Saving..." : "Add Associate"}
        </Button>
      </div>
    </form>
  );
}
