import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { listWaitlistEntries } from "@/actions/waitlist/queries";
import { db } from "@/db/index";
import { lodges } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { WaitlistFilters } from "./waitlist-filters";
import { WaitlistTable } from "./waitlist-table";

export default async function AdminWaitlistPage({
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

  const session = await getSessionMember(org.id);
  if (!session || !isCommitteeOrAbove(session.role)) notFound();

  const orgLodges = await db
    .select({ id: lodges.id, name: lodges.name })
    .from(lodges)
    .where(eq(lodges.organisationId, org.id));

  const filters = {
    status: typeof sp.status === "string" ? sp.status : undefined,
    lodgeId: typeof sp.lodgeId === "string" ? sp.lodgeId : undefined,
    page: typeof sp.page === "string" ? parseInt(sp.page, 10) : 1,
  };

  const result = await listWaitlistEntries(org.id, filters);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Waitlist Management</h1>
        <Badge variant="outline">{result.entries.length}</Badge>
      </div>

      <WaitlistFilters lodges={orgLodges} />

      <WaitlistTable
        entries={result.entries}
        page={result.page}
        pageSize={result.pageSize}
        organisationId={org.id}
        slug={slug}
      />
    </div>
  );
}
