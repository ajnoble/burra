import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember } from "@/lib/auth";
import { getUpcomingBookings } from "@/actions/bookings/queries";
import { formatCurrency } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PaymentButton } from "./payment-button";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${slug}/login`);
  }

  const org = await getOrgBySlug(slug);
  const session = org ? await getSessionMember(org.id) : null;

  let upcomingBookings: Awaited<ReturnType<typeof getUpcomingBookings>> = [];
  if (org && session) {
    upcomingBookings = await getUpcomingBookings(org.id, session.memberId);
  }

  const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
    CONFIRMED: "default",
    PENDING: "secondary",
    WAITLISTED: "secondary",
    CANCELLED: "destructive",
    COMPLETED: "secondary",
  };

  const STATUS_LABEL: Record<string, string> = {
    CONFIRMED: "Confirmed",
    PENDING: "Pending",
    WAITLISTED: "Waitlisted",
    CANCELLED: "Cancelled",
    COMPLETED: "Completed",
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {session?.firstName ?? user.email}
          </p>
        </div>
        <Button render={<Link href={`/${slug}/book`} />}>
          Book a Stay
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border p-4 sm:col-span-2 lg:col-span-2">
          <h3 className="font-medium mb-3">Upcoming Bookings</h3>
          {upcomingBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No upcoming bookings.{" "}
              <Link
                href={`/${slug}/book`}
                className="text-primary underline-offset-4 hover:underline"
              >
                Book a stay
              </Link>
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingBookings.map((b) => (
                <div
                  key={b.id}
                  className="rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{b.lodgeName}</p>
                        <Badge
                          variant={STATUS_VARIANT[b.status] ?? "secondary"}
                        >
                          {STATUS_LABEL[b.status] ?? b.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {b.checkInDate} to {b.checkOutDate} &middot;{" "}
                        {b.totalNights} night{b.totalNights !== 1 ? "s" : ""} &middot;{" "}
                        {b.guestCount} guest{b.guestCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {formatCurrency(b.totalAmountCents)}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {b.bookingReference}
                      </p>
                    </div>
                  </div>
                  {b.balancePaidAt ? (
                    <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-md bg-muted">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      <span className="text-sm text-green-600 dark:text-green-400">
                        Paid
                      </span>
                    </div>
                  ) : b.invoiceTransactionId && org?.stripeConnectOnboardingComplete ? (
                    <PaymentButton
                      organisationId={org.id}
                      transactionId={b.invoiceTransactionId}
                      slug={slug}
                      amountCents={b.totalAmountCents}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Outstanding Balance</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {formatCurrency(
              upcomingBookings
                .filter((b) => !b.balancePaidAt)
                .reduce((sum, b) => sum + b.totalAmountCents, 0)
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
