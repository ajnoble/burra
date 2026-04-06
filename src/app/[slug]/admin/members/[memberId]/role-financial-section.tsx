"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { updateMemberRole } from "@/actions/members/role";
import { updateFinancialStatus } from "@/actions/members/financial";
import { FinancialHistoryTable } from "./financial-history-table";
import { isCommitteeOrAbove } from "@/lib/auth";

type HistoryEntry = {
  id: string;
  isFinancial: boolean;
  reason: string;
  createdAt: Date;
  changedByFirstName: string | null;
  changedByLastName: string | null;
};

export function RoleFinancialSection({
  memberId,
  organisationId,
  slug,
  currentRole,
  isFinancial,
  sessionMemberId,
  sessionRole,
  financialHistory,
}: {
  memberId: string;
  organisationId: string;
  slug: string;
  currentRole: string;
  isFinancial: boolean;
  sessionMemberId: string;
  sessionRole: string;
  financialHistory: HistoryEntry[];
}) {
  const [roleError, setRoleError] = useState<string | null>(null);
  const [rolePending, setRolePending] = useState(false);
  const [showFinancialForm, setShowFinancialForm] = useState(false);
  const [financialError, setFinancialError] = useState<string | null>(null);
  const [financialPending, setFinancialPending] = useState(false);

  const canChangeRole = isCommitteeOrAbove(sessionRole);

  async function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value;
    if (newRole === currentRole) return;

    setRoleError(null);
    setRolePending(true);

    const result = await updateMemberRole({
      memberId,
      organisationId,
      slug,
      role: newRole,
    });

    setRolePending(false);
    if (!result.success) {
      setRoleError(result.error ?? "Failed to update role");
    }
  }

  async function handleFinancialSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFinancialError(null);
    setFinancialPending(true);

    const form = new FormData(e.currentTarget);
    const reason = form.get("reason") as string;

    const result = await updateFinancialStatus({
      memberId,
      organisationId,
      changedByMemberId: sessionMemberId,
      slug,
      isFinancial: !isFinancial,
      reason,
    });

    setFinancialPending(false);
    if (result.success) {
      setShowFinancialForm(false);
    } else {
      setFinancialError(result.error ?? "Failed to update");
    }
  }

  return (
    <div className="space-y-6">
      {/* Role */}
      <div className="space-y-2">
        <Label>Role</Label>
        {canChangeRole ? (
          <div className="flex items-center gap-3">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={currentRole}
              onChange={handleRoleChange}
              disabled={rolePending}
            >
              <option value="MEMBER">Member</option>
              <option value="BOOKING_OFFICER">Booking Officer</option>
              <option value="COMMITTEE">Committee</option>
              <option value="ADMIN">Admin</option>
            </select>
            {rolePending && (
              <span className="text-sm text-muted-foreground">Saving...</span>
            )}
          </div>
        ) : (
          <Badge variant="outline">{currentRole}</Badge>
        )}
        {roleError && (
          <p className="text-sm text-destructive">{roleError}</p>
        )}
      </div>

      <Separator />

      {/* Financial Status */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label>Financial Status</Label>
            <div className="mt-1">
              <Badge variant={isFinancial ? "default" : "destructive"}>
                {isFinancial ? "Financial" : "Unfinancial"}
              </Badge>
            </div>
          </div>
          {!showFinancialForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFinancialForm(true)}
            >
              Change Status
            </Button>
          )}
        </div>

        {showFinancialForm && (
          <form
            onSubmit={handleFinancialSubmit}
            className="space-y-3 p-4 rounded border bg-muted/30"
          >
            <p className="text-sm">
              Change to{" "}
              <strong>{isFinancial ? "Unfinancial" : "Financial"}</strong>
            </p>
            {financialError && (
              <p className="text-sm text-destructive">{financialError}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="reason">Reason *</Label>
              <Input
                id="reason"
                name="reason"
                required
                placeholder="e.g. Annual dues unpaid"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={financialPending}>
                {financialPending ? "Saving..." : "Confirm"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowFinancialForm(false);
                  setFinancialError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>

      <Separator />

      {/* Financial History */}
      <div className="space-y-2">
        <Label>Financial Status History</Label>
        <FinancialHistoryTable history={financialHistory} />
      </div>
    </div>
  );
}
