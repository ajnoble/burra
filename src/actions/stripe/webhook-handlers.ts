import { db } from "@/db/index";
import { transactions, bookings } from "@/db/schema";
import { members, organisations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type Stripe from "stripe";
import { applyBasisPoints } from "@/lib/currency";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { PaymentReceivedEmail } from "@/lib/email/templates/payment-received";
import { PaymentExpiredEmail } from "@/lib/email/templates/payment-expired";

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

  // Get member email, booking ref, and org details for email
  const [emailData] = await db
    .select({
      bookingReference: bookings.bookingReference,
      email: members.email,
      orgName: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(bookings)
    .innerJoin(members, eq(members.id, invoice.memberId))
    .innerJoin(organisations, eq(organisations.id, invoice.organisationId))
    .where(eq(bookings.id, bookingId));

  if (emailData) {
    sendEmail({
      to: emailData.email,
      subject: `Payment received — ${emailData.bookingReference}`,
      template: React.createElement(PaymentReceivedEmail, {
        orgName: emailData.orgName,
        bookingReference: emailData.bookingReference,
        amountCents: amountCents,
        paidDate: new Date().toISOString().split("T")[0],
        logoUrl: emailData.logoUrl || undefined,
      }),
      replyTo: emailData.contactEmail || undefined,
      orgName: emailData.orgName,
    });
  }
}

export async function handleCheckoutSessionExpired(
  session: Stripe.Checkout.Session
): Promise<void> {
  const { transactionId, bookingId, organisationId } = session.metadata ?? {};
  if (!transactionId || !bookingId || !organisationId) return;

  const [data] = await db
    .select({
      bookingReference: bookings.bookingReference,
      email: members.email,
      orgName: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
      slug: organisations.slug,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .innerJoin(bookings, eq(bookings.id, transactions.bookingId))
    .innerJoin(members, eq(members.id, transactions.memberId))
    .innerJoin(organisations, eq(organisations.id, transactions.organisationId))
    .where(eq(transactions.id, transactionId));

  if (!data) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  sendEmail({
    to: data.email,
    subject: `Payment session expired — ${data.bookingReference}`,
    template: React.createElement(PaymentExpiredEmail, {
      orgName: data.orgName,
      bookingReference: data.bookingReference,
      amountCents: data.amountCents,
      payUrl: `${appUrl}/${data.slug}/dashboard`,
      logoUrl: data.logoUrl || undefined,
    }),
    replyTo: data.contactEmail || undefined,
    orgName: data.orgName,
  });
}
