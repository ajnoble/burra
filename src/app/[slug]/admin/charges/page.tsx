import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { getSessionMember } from "@/lib/auth";
import { getChargesForOrganisation } from "@/actions/charges/queries";
import { db } from "@/db/index";
import { chargeCategories, members } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ChargesTable } from "./charges-table";
import { NewChargeDialog } from "./new-charge-dialog";
import { BulkChargeDialog } from "./bulk-charge-dialog";

export default async function AdminChargesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string; categoryId?: string; memberId?: string }>;
}) {
  const { slug } = await params;
  const filters = await searchParams;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session) notFound();

  const charges = await getChargesForOrganisation(org.id, {
    status: filters.status,
    categoryId: filters.categoryId,
    memberId: filters.memberId,
  });

  const categories = await db
    .select({ id: chargeCategories.id, name: chargeCategories.name })
    .from(chargeCategories)
    .where(
      and(
        eq(chargeCategories.organisationId, org.id),
        eq(chargeCategories.isActive, true)
      )
    )
    .orderBy(chargeCategories.sortOrder);

  const allMembers = await db
    .select({
      id: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
    })
    .from(members)
    .where(eq(members.organisationId, org.id))
    .orderBy(members.lastName);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Charges</h1>
        <div className="flex gap-2">
          <BulkChargeDialog
            organisationId={org.id}
            slug={slug}
            categories={categories}
            members={allMembers}
            sessionMemberId={session.memberId}
          />
          <NewChargeDialog
            organisationId={org.id}
            slug={slug}
            categories={categories}
            members={allMembers}
            sessionMemberId={session.memberId}
          />
        </div>
      </div>

      <ChargesTable
        charges={charges}
        organisationId={org.id}
        slug={slug}
        showMemberName
      />
    </div>
  );
}
