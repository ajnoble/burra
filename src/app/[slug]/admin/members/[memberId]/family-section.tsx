"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { unlinkFamilyMember } from "@/actions/members/family";
import { FamilyLinkDialog } from "./family-link-dialog";

type FamilyMember = {
  id: string;
  firstName: string;
  lastName: string;
};

type Dependent = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  membershipClassName: string | null;
};

export function FamilySection({
  memberId,
  organisationId,
  slug,
  primaryMember,
  dependents,
}: {
  memberId: string;
  organisationId: string;
  slug: string;
  primaryMember: FamilyMember | null;
  dependents: Dependent[];
}) {
  const [unlinking, setUnlinking] = useState<string | null>(null);

  async function handleUnlink(targetMemberId: string) {
    setUnlinking(targetMemberId);
    await unlinkFamilyMember({
      organisationId,
      slug,
      memberId: targetMemberId,
    });
    setUnlinking(null);
  }

  const isPrimary = !primaryMember && dependents.length > 0;
  const isDependent = !!primaryMember;
  const isUnlinked = !primaryMember && dependents.length === 0;

  return (
    <div className="space-y-4">
      {isDependent && (
        <div className="flex items-center justify-between p-3 rounded border">
          <div>
            <p className="text-sm text-muted-foreground">Primary Member</p>
            <Link
              href={`/${slug}/admin/members/${primaryMember.id}`}
              className="text-sm font-medium hover:underline"
            >
              {primaryMember.firstName} {primaryMember.lastName}
            </Link>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={unlinking === memberId}
            onClick={() => handleUnlink(memberId)}
          >
            {unlinking === memberId ? "Unlinking..." : "Unlink"}
          </Button>
        </div>
      )}

      {isPrimary && (
        <>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Primary Member</Badge>
            <span className="text-sm text-muted-foreground">
              {dependents.length} dependent{dependents.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-2">
            {dependents.map((dep) => (
              <div
                key={dep.id}
                className="flex items-center justify-between p-3 rounded border"
              >
                <div>
                  <Link
                    href={`/${slug}/admin/members/${dep.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {dep.firstName} {dep.lastName}
                  </Link>
                  <p className="text-xs text-muted-foreground">{dep.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={unlinking === dep.id}
                  onClick={() => handleUnlink(dep.id)}
                >
                  {unlinking === dep.id ? "Unlinking..." : "Unlink"}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {isUnlinked && (
        <p className="text-sm text-muted-foreground">
          Not part of a family group.
        </p>
      )}

      <div className="flex gap-2">
        {!isDependent && (
          <FamilyLinkDialog
            memberId={memberId}
            organisationId={organisationId}
            slug={slug}
            mode="link-dependent"
          />
        )}
        {isUnlinked && (
          <FamilyLinkDialog
            memberId={memberId}
            organisationId={organisationId}
            slug={slug}
            mode="link-primary"
          />
        )}
      </div>
    </div>
  );
}
