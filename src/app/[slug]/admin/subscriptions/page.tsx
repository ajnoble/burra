import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { db } from "@/db/index";
import { membershipClasses } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getSubscriptionList,
  getSubscriptionSummaryForSeason,
  getActiveSeasonForOrg,
  getSeasonsForOrg,
} from "@/actions/subscriptions/queries";
import { SummaryBar } from "./summary-bar";
import { SubscriptionFilters } from "./subscription-filters";
import { SubscriptionTable } from "./subscription-table";
import { Badge } from "@/components/ui/badge";

export default async function AdminSubscriptionsPage({
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

  const [seasons, activeSeason] = await Promise.all([
    getSeasonsForOrg(org.id),
    getActiveSeasonForOrg(org.id),
  ]);

  const seasonId =
    (typeof sp.seasonId === "string" ? sp.seasonId : null) ??
    activeSeason?.id ??
    null;

  if (!seasonId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Subscriptions</h1>
        <p className="text-muted-foreground">No seasons configured.</p>
      </div>
    );
  }

  const orgMembershipClasses = await db
    .select({ id: membershipClasses.id, name: membershipClasses.name })
    .from(membershipClasses)
    .where(eq(membershipClasses.organisationId, org.id));

  const filters = {
    organisationId: org.id,
    seasonId,
    status: typeof sp.status === "string" ? sp.status : undefined,
    membershipClassId: typeof sp.classId === "string" ? sp.classId : undefined,
    page: typeof sp.page === "string" ? parseInt(sp.page, 10) : 1,
  };

  const [result, summary] = await Promise.all([
    getSubscriptionList(filters),
    getSubscriptionSummaryForSeason(org.id, seasonId),
  ]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Subscriptions</h1>
        <Badge variant="outline">{result.total}</Badge>
      </div>

      <SummaryBar
        totalExpected={summary.totalExpected}
        totalCollected={summary.totalCollected}
        totalOutstanding={summary.totalOutstanding}
        totalWaived={summary.totalWaived}
      />

      <SubscriptionFilters
        seasons={seasons}
        membershipClasses={orgMembershipClasses}
        activeSeasonId={activeSeason?.id ?? null}
        organisationId={org.id}
        slug={slug}
      />

      <SubscriptionTable
        subscriptions={result.subscriptions}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        slug={slug}
        organisationId={org.id}
      />
    </div>
  );
}
