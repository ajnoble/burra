"use server";

import { db } from "@/db/index";
import { organisations, transactions, bookings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getStripeClient, buildCheckoutSessionParams } from "@/lib/stripe";
import { getSessionMember } from "@/lib/auth";

type CheckoutResult = {
  success: boolean;
  url?: string;
  error?: string;
};

export async function createCheckoutSession(
  organisationId: string,
  transactionId: string,
  slug: string
): Promise<CheckoutResult> {
  const session = await getSessionMember(organisationId);
  if (!session) {
    return { success: false, error: "You must be authenticated to make a payment" };
  }

  const [org] = await db
    .select({
      stripeConnectAccountId: organisations.stripeConnectAccountId,
      stripeConnectOnboardingComplete: organisations.stripeConnectOnboardingComplete,
      platformFeeBps: organisations.platformFeeBps,
      gstEnabled: organisations.gstEnabled,
    })
    .from(organisations)
    .where(eq(organisations.id, organisationId));

  if (!org?.stripeConnectAccountId || !org.stripeConnectOnboardingComplete) {
    return { success: false, error: "This organisation has not set up payments yet" };
  }

  const [txn] = await db
    .select({
      transactionId: transactions.id,
      amountCents: transactions.amountCents,
      bookingId: transactions.bookingId,
      bookingReference: bookings.bookingReference,
      memberId: transactions.memberId,
      stripePaymentIntentId: transactions.stripePaymentIntentId,
    })
    .from(transactions)
    .innerJoin(bookings, eq(bookings.id, transactions.bookingId))
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.organisationId, organisationId),
        eq(transactions.type, "INVOICE")
      )
    );

  if (!txn) {
    return { success: false, error: "Invoice not found" };
  }

  if (txn.stripePaymentIntentId) {
    return { success: false, error: "This invoice has already been paid" };
  }

  // Block payment for PENDING bookings (awaiting approval)
  const [bookingStatus] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, txn.bookingId!));

  if (bookingStatus?.status === "PENDING") {
    return { success: false, error: "This booking is awaiting approval. You will be notified when it is approved." };
  }

  if (txn.memberId !== session.memberId) {
    return { success: false, error: "You do not have permission to pay this invoice" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const stripe = getStripeClient();
  const params = buildCheckoutSessionParams({
    connectedAccountId: org.stripeConnectAccountId,
    transactionId: txn.transactionId,
    bookingId: txn.bookingId!,
    organisationId,
    bookingReference: txn.bookingReference,
    amountCents: txn.amountCents,
    platformFeeBps: org.platformFeeBps,
    gstEnabled: org.gstEnabled,
    successUrl: `${appUrl}/${slug}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/${slug}/payment/cancelled`,
  });

  const checkoutSession = await stripe.checkout.sessions.create(params, {
    stripeAccount: org.stripeConnectAccountId,
  });

  if (!checkoutSession.url) {
    return { success: false, error: "Failed to create payment session" };
  }

  return { success: true, url: checkoutSession.url };
}
