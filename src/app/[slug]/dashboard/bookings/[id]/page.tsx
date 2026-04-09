import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember } from "@/lib/auth";
import { getBookingDetailForEdit } from "@/actions/bookings/queries";
import { getAvailableBeds } from "@/actions/bookings/beds";
import { formatCurrency } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CancelBookingDialog } from "../../cancel-booking-dialog";
import { EditBookingForm } from "./edit-booking-form";
import { isWithinEditWindow } from "@/actions/bookings/member-edit-helpers";
import { db } from "@/db/index";
import { cancellationPolicies, members as membersTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getBookableMembers } from "@/actions/bookings/members";

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

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${slug}/login`);
  }

  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session) {
    redirect(`/${slug}/login`);
  }

  const booking = await getBookingDetailForEdit(id, org.id, session.memberId);
  if (!booking) notFound();

  // Determine edit eligibility
  const isEditable =
    org.memberBookingEditWindowDays > 0 &&
    (booking.status === "CONFIRMED" || booking.status === "PENDING") &&
    isWithinEditWindow(booking.checkInDate, org.memberBookingEditWindowDays);

  // Fetch available beds and org members only when editable
  const availableBeds = isEditable
    ? await getAvailableBeds(
        booking.lodgeId,
        booking.checkInDate,
        booking.checkOutDate,
        session.memberId,
        booking.id
      )
    : [];

  const orgMembers = isEditable
    ? await getBookableMembers(org.id, session.memberId)
    : [];

  // Get default cancellation policy for cancel dialog
  const [defaultPolicy] = await db
    .select({ rules: cancellationPolicies.rules })
    .from(cancellationPolicies)
    .where(
      and(
        eq(cancellationPolicies.organisationId, org.id),
        eq(cancellationPolicies.isDefault, true)
      )
    );
  const defaultPolicyRules = defaultPolicy?.rules ?? null;

  const stripeConnected = !!org.stripeConnectOnboardingComplete;
  const totalNights = booking.totalNights;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl mx-auto">
      {/* Back link */}
      <div>
        <Button variant="ghost" size="sm" render={<Link href={`/${slug}/dashboard`} />}>
          &larr; Back to Dashboard
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold font-mono">{booking.bookingReference}</h1>
            <Badge variant={STATUS_VARIANT[booking.status] ?? "secondary"}>
              {STATUS_LABEL[booking.status] ?? booking.status}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">{booking.lodgeName}</p>
        </div>
      </div>

      {/* Stay summary */}
      <div className="rounded-lg border p-4">
        <h2 className="font-semibold mb-3">Stay Details</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Check-in</p>
            <p className="font-medium">{booking.checkInDate}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Check-out</p>
            <p className="font-medium">{booking.checkOutDate}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Nights</p>
            <p className="font-medium">{totalNights}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total</p>
            <p className="font-medium">{formatCurrency(booking.totalAmountCents)}</p>
          </div>
        </div>
      </div>

      {/* Guests */}
      <div className="rounded-lg border p-4">
        <h2 className="font-semibold mb-3">Guests ({booking.guests.length})</h2>
        <div className="space-y-3">
          {booking.guests.map((g) => (
            <div key={g.id} className="flex justify-between items-start text-sm">
              <div>
                <p className="font-medium">
                  {g.firstName} {g.lastName}
                </p>
                {g.membershipClassName && (
                  <p className="text-muted-foreground">{g.membershipClassName}</p>
                )}
                <p className="text-muted-foreground">
                  {g.roomName && g.bedLabel
                    ? `${g.roomName} \u00b7 ${g.bedLabel}`
                    : "No bed assigned"}
                </p>
              </div>
              <span>{formatCurrency(g.totalAmountCents)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Payment status */}
      <div className="rounded-lg border p-4">
        <h2 className="font-semibold mb-2">Payment</h2>
        {booking.balancePaidAt ? (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm text-green-600 dark:text-green-400">
              Paid
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            <span className="text-sm text-yellow-600 dark:text-yellow-400">
              Unpaid
            </span>
          </div>
        )}
      </div>

      {/* Edit form or ineligibility message */}
      {isEditable ? (
        <EditBookingForm
          booking={booking}
          organisationId={org.id}
          slug={slug}
          availableBeds={availableBeds}
          orgMembers={orgMembers}
          stripeConnected={stripeConnected}
        />
      ) : (
        booking.status !== "CANCELLED" &&
        booking.status !== "COMPLETED" && (
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            {org.memberBookingEditWindowDays === 0 ? (
              <p>Editing is not enabled for this organisation.</p>
            ) : (
              <p>
                This booking can no longer be edited. Bookings can only be
                modified at least {org.memberBookingEditWindowDays} day
                {org.memberBookingEditWindowDays !== 1 ? "s" : ""} before
                check-in.
              </p>
            )}
          </div>
        )
      )}

      {/* Cancel button */}
      {booking.status !== "CANCELLED" && booking.status !== "COMPLETED" && (
        <div>
          <CancelBookingDialog
            bookingId={booking.id}
            organisationId={org.id}
            slug={slug}
            totalAmountCents={booking.totalAmountCents}
            balancePaidAt={
              booking.balancePaidAt instanceof Date
                ? booking.balancePaidAt.toISOString()
                : booking.balancePaidAt ?? null
            }
            checkInDate={booking.checkInDate}
            policyRules={defaultPolicyRules}
            memberId={session.memberId}
          />
        </div>
      )}
    </div>
  );
}
