import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { getMemberById, getFamilyMembers, getFinancialHistory } from "@/lib/members";
import { db } from "@/db/index";
import { membershipClasses, chargeCategories } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionMember } from "@/lib/auth";
import { PageHeader } from "../../page-header";
import { MemberProfileForm } from "./member-profile-form";
import { FamilySection } from "./family-section";
import { RoleFinancialSection } from "./role-financial-section";
import { MemberChargesSection } from "./member-charges-section";
import { getChargesForMember, getChargesForFamily } from "@/actions/charges/queries";
import { getCustomFields } from "@/actions/custom-fields/manage";
import { getCustomFieldValues } from "@/actions/custom-fields/values";
import { CustomFieldsSection } from "./custom-fields-section";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ slug: string; memberId: string }>;
}) {
  const { slug, memberId } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const member = await getMemberById(org.id, memberId);
  if (!member) notFound();

  const session = await getSessionMember(org.id);
  if (!session) notFound();

  const classes = await db
    .select({ id: membershipClasses.id, name: membershipClasses.name })
    .from(membershipClasses)
    .where(eq(membershipClasses.organisationId, org.id));

  const dependents = await getFamilyMembers(org.id, memberId);
  let primaryMember = null;
  if (member.primaryMemberId) {
    primaryMember = await getMemberById(org.id, member.primaryMemberId);
  }

  const financialHistory = await getFinancialHistory(org.id, memberId);

  // Fetch charges — show family charges if this is a primary member (has dependents)
  const hasDependents = dependents.length > 0;
  const memberCharges = hasDependents
    ? await getChargesForFamily(org.id, memberId)
    : await getChargesForMember(org.id, memberId);

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

  const orgCustomFields = await getCustomFields(org.id);
  const memberCustomFieldValues = await getCustomFieldValues(memberId, org.id);

  return (
    <div className="p-6">
      <PageHeader
        title={`${member.firstName} ${member.lastName}`}
        backHref={`/${slug}/admin/members`}
        backLabel="Members"
      >
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Badge variant="outline">{member.role}</Badge>
          <Badge variant={member.isFinancial ? "default" : "destructive"}>
            {member.isFinancial ? "Financial" : "Unfinancial"}
          </Badge>
        </div>
      </PageHeader>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <MemberProfileForm
            member={{
              id: member.id,
              firstName: member.firstName,
              lastName: member.lastName,
              email: member.email,
              phone: member.phone,
              dateOfBirth: member.dateOfBirth,
              memberNumber: member.memberNumber,
              membershipClassId: member.membershipClassId,
              notes: member.notes,
            }}
            organisationId={org.id}
            slug={slug}
            membershipClasses={classes}
            customFields={orgCustomFields.map((f) => ({
              id: f.id,
              name: f.name,
              key: f.key,
              type: f.type,
              options: f.options,
              isRequired: f.isRequired,
            }))}
            customFieldValues={memberCustomFieldValues.map((v) => ({
              fieldId: v.field.id,
              value: v.value.value,
            }))}
          />
        </CardContent>
      </Card>

      {orgCustomFields.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Custom Fields</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomFieldsSection
              fields={orgCustomFields.map((f) => ({
                name: f.name,
                type: f.type,
                value:
                  memberCustomFieldValues.find((v) => v.field.id === f.id)?.value
                    .value ?? "",
              }))}
            />
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Family Group</CardTitle>
        </CardHeader>
        <CardContent>
          <FamilySection
            memberId={memberId}
            organisationId={org.id}
            slug={slug}
            primaryMember={
              primaryMember
                ? {
                    id: primaryMember.id,
                    firstName: primaryMember.firstName,
                    lastName: primaryMember.lastName,
                  }
                : null
            }
            dependents={dependents}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Role & Financial Status</CardTitle>
        </CardHeader>
        <CardContent>
          <RoleFinancialSection
            memberId={memberId}
            organisationId={org.id}
            slug={slug}
            currentRole={member.role}
            isFinancial={member.isFinancial}
            sessionMemberId={session.memberId}
            sessionRole={session.role}
            financialHistory={financialHistory}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Charges</CardTitle>
        </CardHeader>
        <CardContent>
          <MemberChargesSection
            charges={memberCharges}
            organisationId={org.id}
            slug={slug}
            memberId={memberId}
            categories={categories}
            sessionMemberId={session.memberId}
            showMemberName={hasDependents}
          />
        </CardContent>
      </Card>
    </div>
  );
}
