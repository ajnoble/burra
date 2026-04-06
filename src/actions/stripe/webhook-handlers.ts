import { db } from "@/db/index";
import { transactions, bookings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type Stripe from "stripe";
import { applyBasisPoints } from "@/lib/currency";

export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!paymentIntentId) return;

  const { transactionId, bookingId, organisationId } = session.metadata ?? {};
  if (!transactionId || !bookingId || !organisationId) return;

  // Idempotency check: skip if we already recorded this payment
  const [existing] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.stripePaymentIntentId, paymentIntentId),
        eq(transactions.type, "PAYMENT")
      )
    );

  if (existing) return;

  // Get the invoice transaction for member/amount info
  const [invoice] = await db
    .select({
      id: transactions.id,
      organisationId: transactions.organisationId,
      memberId: transactions.memberId,
      bookingId: transactions.bookingId,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(eq(transactions.id, transactionId));

  if (!invoice) return;

  const amountCents = session.amount_total ?? invoice.amountCents;
  const platformFeeCents = applyBasisPoints(amountCents, 100);

  // Create PAYMENT transaction
  await db.insert(transactions).values({
    organisationId: invoice.organisationId,
    memberId: invoice.memberId,
    bookingId: invoice.bookingId,
    type: "PAYMENT",
    amountCents: amountCents,
    stripePaymentIntentId: paymentIntentId,
    stripeCheckoutSessionId: session.id,
    platformFeeCents,
    description: `Payment received for invoice ${invoice.id}`,
  });

  // Update booking payment timestamp
  await db
    .update(bookings)
    .set({
      balancePaidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId));
}
