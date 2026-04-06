import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember } from "@/lib/auth";
import { getUpcomingBookings } from "@/actions/bookings/queries";
import { getActiveSeasonForOrg, getMemberSubscription } from "@/actions/subscriptions/queries";
import { formatCurrency } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PaymentButton } from "./payment-button";
import { CancelBookingDialog } from "./cancel-booking-dialog";
import { SubscriptionCard } from "./subscription-card";
import { cancellationPolicies } from "@/db/schema";
import { db } from "@/db/index";
import { eq, and } from "drizzle-orm";

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

  const activeSeason = org ? await getActiveSeasonForOrg(org.id) : null;
  const memberSubscription =
    org && session && activeSeason
      ? await getMemberSubscription(org.id, session.memberId, activeSeason.id)
      : null;

  let defaultPolicyRules = null;
  if (org) {
    const [defaultPolicy] = await db
      .select({ rules: cancellationPolicies.rules })
      .from(cancellationPolicies)
      .where(
        and(
          eq(cancellationPolicies.organisationId, org.id),
          eq(cancellationPolicies.isDefault, true)
        )
      );
    defaultPolicyRules = defaultPolicy?.rules ?? null;
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
                  {b.status !== "CANCELLED" && b.status !== "COMPLETED" && session && (
                    <div className="mt-2">
                      <CancelBookingDialog
                        bookingId={b.id}
                        organisationId={org!.id}
                        slug={slug}
                        totalAmountCents={b.totalAmountCents}
                        balancePaidAt={b.balancePaidAt?.toISOString() ?? null}
                        checkInDate={b.checkInDate}
                        policyRules={defaultPolicyRules}
                        memberId={session.memberId}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {memberSubscription && (
          <SubscriptionCard
            subscription={memberSubscription}
            organisationId={org!.id}
            slug={slug}
            stripeConnected={!!org?.stripeConnectOnboardingComplete}
          />
        )}
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Outstanding Balance</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {formatCurrency(
              upcomingBookings
                .filter((b) => !b.balancePaidAt)
                .reduce((sum, b) => sum + b.totalAmountCents, 0) +
              (memberSubscription && memberSubscription.status === "UNPAID" ? memberSubscription.amountCents : 0)
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
