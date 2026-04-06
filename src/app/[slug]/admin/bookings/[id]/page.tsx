import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { getAdminBookingDetail, getAvailableBeds } from "@/lib/bookings";
import { db } from "@/db/index";
import { cancellationPolicies, organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionMember } from "@/lib/auth";
import { BookingActions } from "./booking-actions";
import { ModifyDatesForm } from "./modify-dates-form";
import { ReassignBedsForm } from "./reassign-beds-form";
import { AdminNotesForm } from "./admin-notes-form";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { Separator } from "@/components/ui/separator";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  PENDING: "outline",
  CONFIRMED: "default",
  CANCELLED: "destructive",
  COMPLETED: "secondary",
};

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const booking = await getAdminBookingDetail(id, org.id);
  if (!booking) notFound();

  const availableBeds = await getAvailableBeds(
    booking.lodgeId,
    booking.checkInDate,
    booking.checkOutDate,
    booking.id
  );

  const [orgSettings] = await db
    .select({ defaultApprovalNote: organisations.defaultApprovalNote })
    .from(organisations)
    .where(eq(organisations.id, org.id));

  let policyRules = null;
  if (booking.cancellationPolicyId) {
    const [policy] = await db
      .select({ rules: cancellationPolicies.rules })
      .from(cancellationPolicies)
      .where(eq(cancellationPolicies.id, booking.cancellationPolicyId));
    policyRules = policy?.rules ?? null;
  }

  // Get the session member ID for approve/cancel actions
  const session = await getSessionMember(org.id);
  const sessionMemberId = session?.memberId ?? "";

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono">
              {booking.bookingReference}
            </h1>
            <Badge variant={STATUS_VARIANT[booking.status] ?? "secondary"}>
              {booking.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Created {booking.createdAt.toLocaleDateString()}
          </p>
        </div>
        <BookingActions
          bookingId={booking.id}
          organisationId={org.id}
          status={booking.status}
          slug={slug}
          approverMemberId={sessionMemberId}
          defaultApprovalNote={orgSettings?.defaultApprovalNote ?? ""}
          totalAmountCents={booking.totalAmountCents}
          balancePaidAt={booking.balancePaidAt?.toISOString() ?? null}
          checkInDate={booking.checkInDate}
          policyRules={policyRules}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: Member info, Stay details, Financials, Admin notes */}
        <div className="space-y-6">
          {/* Member info card */}
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="font-semibold">Primary Member</h3>
            <p>
              {booking.memberFirstName} {booking.memberLastName}
            </p>
            <p className="text-sm text-muted-foreground">{booking.memberEmail}</p>
            {booking.memberNumber && (
              <p className="text-sm text-muted-foreground">
                #{booking.memberNumber}
              </p>
            )}
            {booking.membershipClassName && (
              <Badge variant="outline">{booking.membershipClassName}</Badge>
            )}
          </div>

          {/* Stay details card */}
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="font-semibold">Stay Details</h3>
            <p>
              {booking.checkInDate} to {booking.checkOutDate} (
              {booking.totalNights} nights)
            </p>
            <p>{booking.lodgeName}</p>
          </div>

          {/* Financials card */}
          <div className="rounded-lg border p-4 space-y-2">
            <h3 className="font-semibold">Financials</h3>
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatCurrency(booking.subtotalCents)}</span>
            </div>
            {booking.discountAmountCents > 0 && (
              <div className="flex justify-between text-sm">
                <span>Discount</span>
                <span>-{formatCurrency(booking.discountAmountCents)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatCurrency(booking.totalAmountCents)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Payment</span>
              <span>
                {booking.balancePaidAt
                  ? `Paid ${booking.balancePaidAt.toLocaleDateString()}`
                  : "Unpaid"}
              </span>
            </div>
            {booking.refundAmountCents && (
              <div className="flex justify-between text-sm text-destructive">
                <span>Refund</span>
                <span>{formatCurrency(booking.refundAmountCents)}</span>
              </div>
            )}
          </div>

          {/* Approval info (if applicable) */}
          {booking.approvedAt && (
            <div className="rounded-lg border p-4 space-y-1">
              <h3 className="font-semibold">Approval</h3>
              <p className="text-sm">
                Approved {booking.approvedAt.toLocaleDateString()} by{" "}
                {booking.approverFirstName} {booking.approverLastName}
              </p>
            </div>
          )}

          {/* Cancellation info */}
          {booking.cancelledAt && (
            <div className="rounded-lg border border-destructive p-4 space-y-1">
              <h3 className="font-semibold text-destructive">Cancelled</h3>
              <p className="text-sm">
                {booking.cancelledAt.toLocaleDateString()}
              </p>
              {booking.cancellationReason && (
                <p className="text-sm">{booking.cancellationReason}</p>
              )}
            </div>
          )}

          {/* Admin notes */}
          <AdminNotesForm
            bookingId={booking.id}
            organisationId={org.id}
            initialNotes={booking.adminNotes ?? ""}
            slug={slug}
          />
        </div>

        {/* Right column: Guest list, Reassign beds, Modify dates */}
        <div className="space-y-6">
          {/* Guest list */}
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold mb-3">
              Guests ({booking.guests.length})
            </h3>
            <div className="space-y-3">
              {booking.guests.map((g) => (
                <div
                  key={g.id}
                  className="flex justify-between items-start text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {g.firstName} {g.lastName}
                    </p>
                    {g.membershipClassName && (
                      <p className="text-muted-foreground">
                        {g.membershipClassName}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      {g.roomName && g.bedLabel
                        ? `${g.roomName} · ${g.bedLabel}`
                        : "No bed assigned"}
                    </p>
                  </div>
                  <span>{formatCurrency(g.totalAmountCents)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reassign beds */}
          {booking.status !== "CANCELLED" && (
            <ReassignBedsForm
              bookingId={booking.id}
              organisationId={org.id}
              guests={booking.guests}
              availableBeds={availableBeds}
              slug={slug}
            />
          )}

          {/* Modify dates */}
          {booking.status !== "CANCELLED" &&
            booking.status !== "COMPLETED" && (
              <ModifyDatesForm
                bookingId={booking.id}
                organisationId={org.id}
                currentCheckIn={booking.checkInDate}
                currentCheckOut={booking.checkOutDate}
                slug={slug}
              />
            )}

          {/* Transactions */}
          {booking.transactions.length > 0 && (
            <div className="rounded-lg border p-4">
              <h3 className="font-semibold mb-3">Transactions</h3>
              <div className="space-y-2">
                {booking.transactions.map((t) => (
                  <div key={t.id} className="flex justify-between text-sm">
                    <div>
                      <Badge variant="outline" className="mr-2">
                        {t.type}
                      </Badge>
                      <span className="text-muted-foreground">
                        {t.description}
                      </span>
                    </div>
                    <span>{formatCurrency(Math.abs(t.amountCents))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
