import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { getMemberById, getFamilyMembers, getFinancialHistory } from "@/lib/members";
import { db } from "@/db/index";
import { membershipClasses } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionMember } from "@/lib/auth";
import { MemberProfileForm } from "./member-profile-form";
import { FamilySection } from "./family-section";
import { RoleFinancialSection } from "./role-financial-section";

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

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/${slug}/admin/members`} />}
        >
          &larr; Members
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {member.firstName} {member.lastName}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{member.role}</Badge>
            <Badge variant={member.isFinancial ? "default" : "destructive"}>
              {member.isFinancial ? "Financial" : "Unfinancial"}
            </Badge>
          </div>
        </div>
      </div>

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
          />
        </CardContent>
      </Card>

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
    </div>
  );
}
