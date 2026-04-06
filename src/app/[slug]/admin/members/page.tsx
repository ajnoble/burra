import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { getMembers } from "@/lib/members";
import { db } from "@/db/index";
import { membershipClasses } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MemberFilters } from "./member-filters";
import { MemberTable } from "./member-table";

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const classes = await db
    .select({ id: membershipClasses.id, name: membershipClasses.name })
    .from(membershipClasses)
    .where(eq(membershipClasses.organisationId, org.id));

  const filters = {
    search: typeof sp.search === "string" ? sp.search : undefined,
    membershipClassId: typeof sp.classId === "string" ? sp.classId : undefined,
    role: typeof sp.role === "string" ? sp.role : undefined,
    isFinancial:
      sp.financial === "true" ? true : sp.financial === "false" ? false : undefined,
    hasFamily:
      sp.family === "true" ? true : sp.family === "false" ? false : undefined,
    joinedFrom: typeof sp.joinedFrom === "string" ? sp.joinedFrom : undefined,
    joinedTo: typeof sp.joinedTo === "string" ? sp.joinedTo : undefined,
    page: typeof sp.page === "string" ? parseInt(sp.page, 10) : 1,
  };

  const result = await getMembers(org.id, filters);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Members</h1>
          <Badge variant="outline">{result.total}</Badge>
        </div>
        <Button render={<Link href={`/${slug}/admin/members/new`} />}>
          Add Member
        </Button>
      </div>

      <MemberFilters membershipClasses={classes} />
      <MemberTable
        members={result.rows}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        slug={slug}
      />
    </div>
  );
}
