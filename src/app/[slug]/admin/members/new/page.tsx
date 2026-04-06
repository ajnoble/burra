import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { db } from "@/db/index";
import { membershipClasses } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/${slug}/admin/members`} />}
        >
          &larr; Members
        </Button>
        <h1 className="text-2xl font-bold">Add Member</h1>
      </div>

      <MemberForm
        organisationId={org.id}
        slug={slug}
        membershipClasses={classes}
      />
    </div>
  );
}
