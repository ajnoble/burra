"use client";

import { ChargesTable } from "@/app/[slug]/admin/charges/charges-table";
import { NewChargeDialog } from "@/app/[slug]/admin/charges/new-charge-dialog";
import type { ChargeWithDetails } from "@/actions/charges/queries";

type Category = { id: string; name: string };

export function MemberChargesSection({
  charges,
  organisationId,
  slug,
  memberId,
  categories,
  sessionMemberId,
  showMemberName,
}: {
  charges: ChargeWithDetails[];
  organisationId: string;
  slug: string;
  memberId: string;
  categories: Category[];
  sessionMemberId: string;
  showMemberName?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NewChargeDialog
          organisationId={organisationId}
          slug={slug}
          categories={categories}
          members={[]}
          preselectedMemberId={memberId}
          sessionMemberId={sessionMemberId}
        />
      </div>
      <ChargesTable
        charges={charges}
        organisationId={organisationId}
        slug={slug}
        showMemberName={showMemberName}
      />
    </div>
  );
}
