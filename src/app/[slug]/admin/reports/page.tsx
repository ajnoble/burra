import { getOrgBySlug } from "@/lib/org";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

const REPORTS = [
  { id: "transaction-ledger", title: "Transaction Ledger", description: "Full transaction history with running balance. Export in Xero-compatible format." },
  { id: "revenue-summary", title: "Revenue Summary", description: "Revenue breakdown by period — bookings, subscriptions, refunds, and platform fees." },
  { id: "member-balances", title: "Member Balances", description: "Per-member totals: paid, refunded, and outstanding balance." },
  { id: "subscription-status", title: "Subscription Status", description: "Membership fee status by season — paid, unpaid, and waived." },
  { id: "occupancy", title: "Occupancy Report", description: "Daily bed utilisation by lodge — total, booked, available, and occupancy %." },
  { id: "arrivals-departures", title: "Arrivals & Departures", description: "Daily arrivals and departures with member details and payment status." },
  { id: "booking-summary", title: "Booking Summary", description: "All bookings with guest counts, amounts, and status breakdown." },
  { id: "gst-summary", title: "GST Summary", description: "GST collected by period and category — BAS-ready for ATO reporting." },
];

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session || !isCommitteeOrAbove(session.role)) {
    redirect(`/${slug}/login`);
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Reports</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => (
          <Link key={report.id} href={`/${slug}/admin/reports/${report.id}`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="p-4">
                <h3 className="font-medium">{report.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{report.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
