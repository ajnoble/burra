"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { saveCancellationPolicy } from "@/actions/cancellation-policies/save";
import type { CancellationRule } from "@/db/schema/cancellation-policies";
import { toast } from "sonner";

type Policy = {
  id: string;
  organisationId: string;
  name: string;
  rules: CancellationRule[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type Props = {
  organisationId: string;
  initialPolicies: Policy[];
};

function buildPreviewRows(
  rules: CancellationRule[]
): { label: string; refund: string }[] {
  if (rules.length === 0) return [];

  // Sort descending by daysBeforeCheckin
  const sorted = [...rules].sort((a, b) => b.daysBeforeCheckin - a.daysBeforeCheckin);

  const rows: { label: string; refund: string }[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const refundPct = 100 - current.forfeitPercentage;

    let label: string;
    if (next) {
      label = `${next.daysBeforeCheckin}–${current.daysBeforeCheckin - 1} days before check-in`;
    } else {
      label = `${current.daysBeforeCheckin}+ days before check-in`;
    }

    const refund =
      refundPct === 100
        ? "Full refund"
        : refundPct === 0
        ? "No refund"
        : `${refundPct}% refund`;

    rows.push({ label, refund });
  }

  // Add fallback row
  const lowestDays = sorted[sorted.length - 1]?.daysBeforeCheckin ?? 0;
  rows.push({
    label: `Less than ${lowestDays} days before check-in`,
    refund: "No refund",
  });

  return rows;
}

function PolicyEditor({
  policy,
  organisationId,
  onSaved,
}: {
  policy: Policy | null;
  organisationId: string;
  onSaved: (saved: Policy) => void;
}) {
  const [name, setName] = useState(policy?.name ?? "");
  const [rules, setRules] = useState<CancellationRule[]>(
    policy?.rules ?? [{ daysBeforeCheckin: 14, forfeitPercentage: 0 }]
  );
  const [isDefault, setIsDefault] = useState(policy?.isDefault ?? false);
  const [saving, setSaving] = useState(false);

  function addTier() {
    setRules((prev) => [...prev, { daysBeforeCheckin: 7, forfeitPercentage: 50 }]);
  }

  function removeRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRule(index: number, field: keyof CancellationRule, value: number) {
    setRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Policy name is required");
      return;
    }
    if (rules.length === 0) {
      toast.error("At least one rule is required");
      return;
    }

    setSaving(true);
    try {
      const result = await saveCancellationPolicy({
        organisationId,
        id: policy?.id,
        name: name.trim(),
        rules,
        isDefault,
      });

      if (!result.success) {
        toast.error(result.error ?? "Failed to save policy");
        return;
      }

      toast.success(policy ? "Policy updated" : "Policy created");
      onSaved({
        id: result.id!,
        organisationId,
        name: name.trim(),
        rules,
        isDefault,
        createdAt: policy?.createdAt ?? new Date(),
        updatedAt: new Date(),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save policy");
    } finally {
      setSaving(false);
    }
  }

  const previewRows = buildPreviewRows(rules);

  return (
    <div className="space-y-6">
      {/* Policy name */}
      <div className="space-y-2">
        <Label htmlFor="policy-name">Policy Name</Label>
        <Input
          id="policy-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Standard Cancellation Policy"
        />
      </div>

      {/* Tiered rules */}
      <div className="space-y-2">
        <Label>Cancellation Tiers</Label>
        <div className="space-y-2">
          {rules.map((rule, index) => (
            <Card key={index}>
              <CardContent className="flex items-center gap-3 py-3 px-4">
                <span className="text-sm text-muted-foreground shrink-0">
                  If cancelled
                </span>
                <Input
                  type="number"
                  min={1}
                  value={rule.daysBeforeCheckin}
                  onChange={(e) =>
                    updateRule(index, "daysBeforeCheckin", parseInt(e.target.value, 10) || 1)
                  }
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground shrink-0">
                  or more days before check-in →
                </span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={rule.forfeitPercentage}
                  onChange={(e) =>
                    updateRule(
                      index,
                      "forfeitPercentage",
                      Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0))
                    )
                  }
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground shrink-0">% forfeit</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRule(index)}
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  aria-label="Remove tier"
                >
                  ✕
                </Button>
              </CardContent>
            </Card>
          ))}

          {/* Fallback row */}
          <Card className="border-dashed opacity-70">
            <CardContent className="py-3 px-4">
              <span className="text-sm text-muted-foreground">
                Otherwise → 100% forfeit (no refund)
              </span>
            </CardContent>
          </Card>
        </div>

        <Button variant="outline" size="sm" onClick={addTier} className="mt-2">
          + Add Tier
        </Button>
      </div>

      {/* Live preview */}
      {previewRows.length > 0 && (
        <div className="space-y-2">
          <Label>Preview</Label>
          <Card>
            <CardContent className="py-3 px-4">
              <table className="w-full text-sm">
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 text-muted-foreground">{row.label}</td>
                      <td className="py-1.5 text-right font-medium">{row.refund}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Set as default */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="policy-default"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <Label htmlFor="policy-default" className="cursor-pointer font-normal">
          Set as default policy
        </Label>
      </div>

      {/* Save */}
      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : policy ? "Update Policy" : "Create Policy"}
      </Button>
    </div>
  );
}

export function CancellationPolicyManager({ organisationId, initialPolicies }: Props) {
  const [policies, setPolicies] = useState<Policy[]>(initialPolicies);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleSaved(saved: Policy) {
    setPolicies((prev) => {
      const exists = prev.find((p) => p.id === saved.id);
      if (exists) {
        return prev.map((p) => (p.id === saved.id ? saved : p));
      }
      return [...prev, saved];
    });
    setAdding(false);
    setEditingId(null);
  }

  if (policies.length === 0 && !adding) {
    return (
      <div className="text-center py-8 border border-dashed rounded-lg">
        <p className="text-muted-foreground text-sm mb-4">
          No cancellation policies configured yet.
        </p>
        <Button variant="outline" onClick={() => setAdding(true)}>
          Add Policy
        </Button>
      </div>
    );
  }

  if (adding) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">New Cancellation Policy</h3>
          <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
        <PolicyEditor
          policy={null}
          organisationId={organisationId}
          onSaved={handleSaved}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {policies.map((policy) =>
        editingId === policy.id ? (
          <div key={policy.id} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Edit Policy</h3>
              <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </div>
            <PolicyEditor
              policy={policy}
              organisationId={organisationId}
              onSaved={handleSaved}
            />
          </div>
        ) : (
          <Card key={policy.id}>
            <CardContent className="flex items-center justify-between py-3 px-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{policy.name}</span>
                  {policy.isDefault && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {policy.rules.length} tier{policy.rules.length !== 1 ? "s" : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingId(policy.id)}
              >
                Edit
              </Button>
            </CardContent>
          </Card>
        )
      )}

      <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
        + Add Policy
      </Button>
    </div>
  );
}
