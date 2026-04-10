import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { db } from "@/db/index";
import { membershipClasses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "../../page-header";
import { MemberForm } from "./member-form";

export default async function NewMemberPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const classes = await db
    .select({ id: membershipClasses.id, name: membershipClasses.name })
    .from(membershipClasses)
    .where(eq(membershipClasses.organisationId, org.id));

  return (
    <div className="p-6">
      <PageHeader
        title="Add Member"
        backHref={`/${slug}/admin/members`}
        backLabel="Members"
      />

      <MemberForm
        organisationId={org.id}
        slug={slug}
        membershipClasses={classes}
      />
    </div>
  );
}
