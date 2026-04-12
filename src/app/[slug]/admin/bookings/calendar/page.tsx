import { notFound } from "next/navigation";
import { getOrgBySlug } from "@/lib/org";
import { requireSession, requireRole } from "@/lib/auth-guards";
import { db } from "@/db/index";
import { lodges, seasons } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { AdminMatrixClient } from "./admin-matrix-client";
import Link from "next/link";

export default async function AdminBookingCalendarPage({
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

  const session = await requireSession(org.id);
  requireRole(session, "BOOKING_OFFICER");

  const [orgLodges, activeSeasons] = await Promise.all([
    db
      .select({ id: lodges.id, name: lodges.name })
      .from(lodges)
      .where(and(eq(lodges.organisationId, org.id), eq(lodges.isActive, true))),
    db
      .select({
        id: seasons.id,
        startDate: seasons.startDate,
        endDate: seasons.endDate,
      })
      .from(seasons)
      .where(
        and(eq(seasons.organisationId, org.id), eq(seasons.isActive, true))
      ),
  ]);

  if (orgLodges.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Booking Calendar</h1>
        <p className="text-muted-foreground">No active lodges configured.</p>
      </div>
    );
  }

  const selectedLodgeId =
    typeof sp.lodge === "string" ? sp.lodge : orgLodges[0].id;

  const selectedLodge =
    orgLodges.find((l) => l.id === selectedLodgeId) ?? orgLodges[0];

  const activeSeason = activeSeasons[0];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Booking Calendar</h1>
      <p className="text-muted-foreground mb-6">
        Full occupancy view across all beds and rooms.
      </p>

      {/* Lodge selector — only shown when multiple active lodges exist */}
      {orgLodges.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {orgLodges.map((lodge) => (
            <Link
              key={lodge.id}
              href={`/${slug}/admin/bookings/calendar?lodge=${lodge.id}`}
              className={[
                "rounded-md border px-3 py-1.5 text-sm transition-colors",
                lodge.id === selectedLodge.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              {lodge.name}
            </Link>
          ))}
        </div>
      )}

      <AdminMatrixClient
        lodgeId={selectedLodge.id}
        lodgeName={selectedLodge.name}
        slug={slug}
        seasonStartDate={activeSeason?.startDate ?? undefined}
        seasonEndDate={activeSeason?.endDate ?? undefined}
      />
    </div>
  );
}
