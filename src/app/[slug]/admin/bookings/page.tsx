import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { getAdminBookings, getPendingApprovalCount } from "@/lib/bookings";
import { db } from "@/db/index";
import { lodges } from "@/db/schema";
import { eq } from "drizzle-orm";
import { BookingFilters } from "./booking-filters";
import { BookingTable } from "./booking-table";
import { Badge } from "@/components/ui/badge";

export default async function AdminBookingsPage({
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

  const orgLodges = await db
    .select({ id: lodges.id, name: lodges.name })
    .from(lodges)
    .where(eq(lodges.organisationId, org.id));

  const filters = {
    search: typeof sp.search === "string" ? sp.search : undefined,
    status: typeof sp.status === "string" ? sp.status : undefined,
    lodgeId: typeof sp.lodgeId === "string" ? sp.lodgeId : undefined,
    dateFrom: typeof sp.dateFrom === "string" ? sp.dateFrom : undefined,
    dateTo: typeof sp.dateTo === "string" ? sp.dateTo : undefined,
    page: typeof sp.page === "string" ? parseInt(sp.page, 10) : 1,
  };

  const result = await getAdminBookings({ organisationId: org.id, ...filters });
  const pendingCount = await getPendingApprovalCount(org.id);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Bookings</h1>
        <Badge variant="outline">{result.total}</Badge>
      </div>

      <BookingFilters
        lodges={orgLodges}
        pendingCount={pendingCount}
      />
      <BookingTable
        bookings={result.bookings}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        slug={slug}
      />
    </div>
  );
}
