// src/actions/stripe/refund.ts
import { db } from "@/db/index";
import { transactions, organisations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getStripeClient } from "@/lib/stripe";

type RefundResult = {
  success: boolean;
  error?: string;
  stripeRefundId?: string;
};

export async function processStripeRefund(
  bookingId: string,
  refundAmountCents: number
): Promise<RefundResult> {
  // Find the PAYMENT transaction for this booking
  const [payment] = await db
    .select({
      stripePaymentIntentId: transactions.stripePaymentIntentId,
      organisationId: transactions.organisationId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.bookingId, bookingId),
        eq(transactions.type, "PAYMENT")
      )
    );

  if (!payment?.stripePaymentIntentId) {
    // No payment to refund
    return { success: true };
  }

  // Get connected account ID
  const [org] = await db
    .select({ stripeConnectAccountId: organisations.stripeConnectAccountId })
    .from(organisations)
    .where(eq(organisations.id, payment.organisationId));

  if (!org?.stripeConnectAccountId) {
    return { success: false, error: "Organisation has no Stripe account" };
  }

  const stripe = getStripeClient();
  const refund = await stripe.refunds.create(
    {
      payment_intent: payment.stripePaymentIntentId,
      amount: refundAmountCents,
    },
    { stripeAccount: org.stripeConnectAccountId }
  );

  return { success: true, stripeRefundId: refund.id };
}
