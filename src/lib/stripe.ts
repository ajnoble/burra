import Stripe from "stripe";
import { applyBasisPoints } from "./currency";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  stripeClient = new Stripe(key);
  return stripeClient;
}

export type CheckoutSessionInput = {
  connectedAccountId: string;
  transactionId: string;
  bookingId: string;
  organisationId: string;
  bookingReference: string;
  amountCents: number;
  platformFeeBps: number;
  successUrl: string;
  cancelUrl: string;
};

export function buildCheckoutSessionParams(input: CheckoutSessionInput) {
  const platformFeeCents = applyBasisPoints(input.amountCents, input.platformFeeBps);

  return {
    mode: "payment" as const,
    line_items: [
      {
        price_data: {
          currency: "aud",
          product_data: { name: `Booking ${input.bookingReference}` },
          unit_amount: input.amountCents,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: platformFeeCents,
    },
    metadata: {
      transactionId: input.transactionId,
      bookingId: input.bookingId,
      organisationId: input.organisationId,
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
}

export type ConsolidatedCheckoutInput = {
  connectedAccountId: string;
  organisationId: string;
  lineItems: Array<{
    name: string;
    amountCents: number;
  }>;
  totalAmountCents: number;
  platformFeeBps: number;
  successUrl: string;
  cancelUrl: string;
};

export function buildConsolidatedCheckoutParams(input: ConsolidatedCheckoutInput) {
  const platformFeeCents = applyBasisPoints(input.totalAmountCents, input.platformFeeBps);

  return {
    mode: "payment" as const,
    line_items: input.lineItems.map((item) => ({
      price_data: {
        currency: "aud",
        product_data: { name: item.name },
        unit_amount: item.amountCents,
      },
      quantity: 1,
    })),
    payment_intent_data: {
      application_fee_amount: platformFeeCents,
    },
    metadata: {
      isConsolidated: "true" as string,
      organisationId: input.organisationId as string,
      payerMemberId: "" as string,
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
}

export type SubscriptionCheckoutInput = {
  connectedAccountId: string;
  subscriptionId: string;
  organisationId: string;
  seasonName: string;
  amountCents: number;
  platformFeeBps: number;
  successUrl: string;
  cancelUrl: string;
};

export function buildSubscriptionCheckoutParams(input: SubscriptionCheckoutInput) {
  const platformFeeCents = applyBasisPoints(input.amountCents, input.platformFeeBps);

  return {
    mode: "payment" as const,
    line_items: [
      {
        price_data: {
          currency: "aud",
          product_data: { name: `Membership Fee — ${input.seasonName}` },
          unit_amount: input.amountCents,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: platformFeeCents,
    },
    metadata: {
      subscriptionId: input.subscriptionId,
      organisationId: input.organisationId,
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
}
