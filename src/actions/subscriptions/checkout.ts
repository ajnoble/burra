"use server";

import { db } from "@/db/index";
import { organisations, subscriptions, seasons } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getStripeClient, buildSubscriptionCheckoutParams } from "@/lib/stripe";
import { getSessionMember } from "@/lib/auth";

type CheckoutResult = {
  success: boolean;
  url?: string;
  error?: string;
};

export async function createSubscriptionCheckoutSession(
  organisationId: string,
  subscriptionId: string,
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
    })
    .from(organisations)
    .where(eq(organisations.id, organisationId));

  if (!org?.stripeConnectAccountId || !org.stripeConnectOnboardingComplete) {
    return { success: false, error: "This organisation has not set up payments yet" };
  }

  const [sub] = await db
    .select({
      subscriptionId: subscriptions.id,
      amountCents: subscriptions.amountCents,
      memberId: subscriptions.memberId,
      seasonName: seasons.name,
      status: subscriptions.status,
      stripePaymentIntentId: subscriptions.stripePaymentIntentId,
    })
    .from(subscriptions)
    .innerJoin(seasons, eq(seasons.id, subscriptions.seasonId))
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.organisationId, organisationId)
      )
    );

  if (!sub) {
    return { success: false, error: "Subscription not found" };
  }

  if (sub.status !== "UNPAID") {
    return { success: false, error: "This subscription is not payable" };
  }

  if (sub.memberId !== session.memberId) {
    return { success: false, error: "You do not have permission to pay this subscription" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const stripe = getStripeClient();
  const params = buildSubscriptionCheckoutParams({
    connectedAccountId: org.stripeConnectAccountId,
    subscriptionId: sub.subscriptionId,
    organisationId,
    seasonName: sub.seasonName,
    amountCents: sub.amountCents,
    platformFeeBps: org.platformFeeBps,
    successUrl: `${appUrl}/${slug}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/${slug}/dashboard`,
  });

  const checkoutSession = await stripe.checkout.sessions.create(params, {
    stripeAccount: org.stripeConnectAccountId,
  });

  if (!checkoutSession.url) {
    return { success: false, error: "Failed to create payment session" };
  }

  return { success: true, url: checkoutSession.url };
}
