"use server";

import { db } from "@/db/index";
import {
  organisations,
  oneOffCharges,
  subscriptions,
  transactions,
  bookings,
  chargeCategories,
  checkoutLineItems,
  members,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getStripeClient, buildConsolidatedCheckoutParams } from "@/lib/stripe";
import { getSessionMember } from "@/lib/auth";
import { calculateGst } from "@/lib/currency";

type ConsolidatedCheckoutInput = {
  organisationId: string;
  slug: string;
  chargeIds: string[];
  subscriptionIds: string[];
  invoiceTransactionIds: string[];
};

type ConsolidatedCheckoutResult = {
  success: boolean;
  url?: string;
  error?: string;
};

export async function createConsolidatedCheckoutSession(
  input: ConsolidatedCheckoutInput
): Promise<ConsolidatedCheckoutResult> {
  const session = await getSessionMember(input.organisationId);
  if (!session) {
    return { success: false, error: "You must be authenticated to make a payment" };
  }

  const [org] = await db
    .select({
      stripeConnectAccountId: organisations.stripeConnectAccountId,
      stripeConnectOnboardingComplete: organisations.stripeConnectOnboardingComplete,
      platformFeeBps: organisations.platformFeeBps,
      gstEnabled: organisations.gstEnabled,
      gstRateBps: organisations.gstRateBps,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  if (!org?.stripeConnectAccountId || !org.stripeConnectOnboardingComplete) {
    return { success: false, error: "This organisation has not set up payments yet" };
  }

  // Gather all items
  type LineItemData = {
    chargeType: "ONE_OFF_CHARGE" | "SUBSCRIPTION" | "BOOKING_INVOICE";
    chargeId: string;
    memberId: string;
    amountCents: number;
    name: string;
  };

  const items: LineItemData[] = [];

  // One-off charges
  if (input.chargeIds.length > 0) {
    const charges = await db
      .select({
        id: oneOffCharges.id,
        memberId: oneOffCharges.memberId,
        amountCents: oneOffCharges.amountCents,
        categoryName: chargeCategories.name,
        description: oneOffCharges.description,
      })
      .from(oneOffCharges)
      .innerJoin(chargeCategories, eq(chargeCategories.id, oneOffCharges.categoryId))
      .where(
        and(
          inArray(oneOffCharges.id, input.chargeIds),
          eq(oneOffCharges.organisationId, input.organisationId),
          eq(oneOffCharges.status, "UNPAID")
        )
      );

    for (const c of charges) {
      items.push({
        chargeType: "ONE_OFF_CHARGE",
        chargeId: c.id,
        memberId: c.memberId,
        amountCents: c.amountCents,
        name: c.description ? `${c.categoryName} — ${c.description}` : c.categoryName,
      });
    }
  }

  // Subscriptions
  if (input.subscriptionIds.length > 0) {
    const subs = await db
      .select({
        id: subscriptions.id,
        memberId: subscriptions.memberId,
        amountCents: subscriptions.amountCents,
      })
      .from(subscriptions)
      .where(
        and(
          inArray(subscriptions.id, input.subscriptionIds),
          eq(subscriptions.organisationId, input.organisationId),
          eq(subscriptions.status, "UNPAID")
        )
      );

    for (const s of subs) {
      items.push({
        chargeType: "SUBSCRIPTION",
        chargeId: s.id,
        memberId: s.memberId,
        amountCents: s.amountCents,
        name: "Membership Subscription",
      });
    }
  }

  // Booking invoices
  if (input.invoiceTransactionIds.length > 0) {
    const invoices = await db
      .select({
        id: transactions.id,
        memberId: transactions.memberId,
        amountCents: transactions.amountCents,
        bookingReference: bookings.bookingReference,
      })
      .from(transactions)
      .innerJoin(bookings, eq(bookings.id, transactions.bookingId))
      .where(
        and(
          inArray(transactions.id, input.invoiceTransactionIds),
          eq(transactions.organisationId, input.organisationId),
          eq(transactions.type, "INVOICE")
        )
      );

    for (const inv of invoices) {
      items.push({
        chargeType: "BOOKING_INVOICE",
        chargeId: inv.id,
        memberId: inv.memberId,
        amountCents: inv.amountCents,
        name: `Booking ${inv.bookingReference}`,
      });
    }
  }

  if (items.length === 0) {
    return { success: false, error: "No items to pay" };
  }

  // Verify the payer owns all charges (self or family dependents)
  const familyDependents = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organisationId, input.organisationId),
        eq(members.primaryMemberId, session.memberId)
      )
    );

  const allowedMemberIds = new Set([
    session.memberId,
    ...familyDependents.map((d) => d.id),
  ]);

  const unauthorizedItem = items.find((i) => !allowedMemberIds.has(i.memberId));
  if (unauthorizedItem) {
    return { success: false, error: "You can only pay charges for yourself or your family members" };
  }

  const totalAmountCents = items.reduce((sum, i) => sum + i.amountCents, 0);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const stripe = getStripeClient();
  const params = buildConsolidatedCheckoutParams({
    connectedAccountId: org.stripeConnectAccountId,
    organisationId: input.organisationId,
    lineItems: items.map((i) => ({ name: i.name, amountCents: i.amountCents })),
    totalAmountCents,
    platformFeeBps: org.platformFeeBps,
    gstEnabled: org.gstEnabled,
    successUrl: `${appUrl}/${input.slug}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/${input.slug}/payment/cancelled`,
  });

  params.metadata.payerMemberId = session.memberId;

  const checkoutSession = await stripe.checkout.sessions.create(params, {
    stripeAccount: org.stripeConnectAccountId,
  });

  if (!checkoutSession.url) {
    return { success: false, error: "Failed to create payment session" };
  }

  // Store line items for webhook processing
  for (const item of items) {
    await db.insert(checkoutLineItems).values({
      stripeCheckoutSessionId: checkoutSession.id,
      chargeType: item.chargeType,
      chargeId: item.chargeId,
      amountCents: item.amountCents,
      memberId: item.memberId,
      gstAmountCents: org.gstEnabled ? calculateGst(item.amountCents, org.gstRateBps) : 0,
    });
  }

  return { success: true, url: checkoutSession.url };
}
