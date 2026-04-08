import { db } from "@/db/index";
import { transactions, bookings, subscriptions } from "@/db/schema";
import { members, organisations } from "@/db/schema";
import { oneOffCharges, checkoutLineItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type Stripe from "stripe";
import { applyBasisPoints, calculateGst } from "@/lib/currency";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { PaymentReceivedEmail } from "@/lib/email/templates/payment-received";
import { PaymentExpiredEmail } from "@/lib/email/templates/payment-expired";
import { ConsolidatedPaymentReceivedEmail } from "@/lib/email/templates/consolidated-payment-received";

export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!paymentIntentId) return;

  const { isConsolidated } = session.metadata ?? {};

  if (isConsolidated === "true") {
    // Consolidated checkout — process each line item
    const lineItems = await db
      .select({
        id: checkoutLineItems.id,
        chargeType: checkoutLineItems.chargeType,
        chargeId: checkoutLineItems.chargeId,
        amountCents: checkoutLineItems.amountCents,
        memberId: checkoutLineItems.memberId,
      })
      .from(checkoutLineItems)
      .where(eq(checkoutLineItems.stripeCheckoutSessionId, session.id));

    if (lineItems.length === 0) return;

    const { organisationId } = session.metadata ?? {};
    if (!organisationId) return;

    // Look up the org's platform fee and GST settings
    const [orgData] = await db
      .select({
        platformFeeBps: organisations.platformFeeBps,
        gstEnabled: organisations.gstEnabled,
        gstRateBps: organisations.gstRateBps,
        abnNumber: organisations.abnNumber,
      })
      .from(organisations)
      .where(eq(organisations.id, organisationId));

    const feeBps = orgData?.platformFeeBps ?? 100;

    // Idempotency: check if we already processed this session
    const [existingTxn] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.stripeCheckoutSessionId, session.id),
          eq(transactions.type, "PAYMENT")
        )
      );
    if (existingTxn) return;

    const emailLineItems: Array<{ description: string; memberName: string; amountCents: number }> = [];

    for (const item of lineItems) {
      // Create PAYMENT transaction for each line item
      const gstAmountCents = orgData?.gstEnabled
        ? calculateGst(item.amountCents, orgData.gstRateBps)
        : 0;
      const [txn] = await db
        .insert(transactions)
        .values({
          organisationId,
          memberId: item.memberId,
          type: "PAYMENT",
          amountCents: item.amountCents,
          stripePaymentIntentId: paymentIntentId,
          stripeCheckoutSessionId: session.id,
          platformFeeCents: applyBasisPoints(item.amountCents, feeBps),
          gstAmountCents,
          description: `Consolidated payment — ${item.chargeType.replace(/_/g, " ").toLowerCase()}`,
        })
        .returning();

      // Update source record based on charge type
      if (item.chargeType === "ONE_OFF_CHARGE") {
        await db
          .update(oneOffCharges)
          .set({
            status: "PAID",
            paidAt: new Date(),
            stripePaymentIntentId: paymentIntentId,
            transactionId: txn.id,
            updatedAt: new Date(),
          })
          .where(eq(oneOffCharges.id, item.chargeId));
      } else if (item.chargeType === "SUBSCRIPTION") {
        await db
          .update(subscriptions)
          .set({
            status: "PAID",
            paidAt: new Date(),
            stripePaymentIntentId: paymentIntentId,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, item.chargeId));
      } else if (item.chargeType === "BOOKING_INVOICE") {
        const [invoiceTxn] = await db
          .select({ bookingId: transactions.bookingId })
          .from(transactions)
          .where(eq(transactions.id, item.chargeId));

        if (invoiceTxn?.bookingId) {
          await db
            .update(bookings)
            .set({ balancePaidAt: new Date(), updatedAt: new Date() })
            .where(eq(bookings.id, invoiceTxn.bookingId));
        }
      }

      // Get member name for receipt email
      const [memberData] = await db
        .select({ firstName: members.firstName, lastName: members.lastName })
        .from(members)
        .where(eq(members.id, item.memberId));

      emailLineItems.push({
        description: item.chargeType.replace(/_/g, " ").toLowerCase(),
        memberName: memberData ? `${memberData.firstName} ${memberData.lastName}` : "Unknown",
        amountCents: item.amountCents,
      });
    }

    // Send consolidated receipt email to the payer
    const payerMemberId = session.metadata?.payerMemberId || lineItems[0].memberId;
    const [emailData] = await db
      .select({
        email: members.email,
        orgName: organisations.name,
        contactEmail: organisations.contactEmail,
        logoUrl: organisations.logoUrl,
      })
      .from(members)
      .innerJoin(organisations, eq(organisations.id, organisationId))
      .where(eq(members.id, payerMemberId));

    if (emailData) {
      const totalAmount = lineItems.reduce((sum, i) => sum + i.amountCents, 0);
      sendEmail({
        to: emailData.email,
        subject: `Payment received — ${emailLineItems.length} item${emailLineItems.length > 1 ? "s" : ""}`,
        template: React.createElement(ConsolidatedPaymentReceivedEmail, {
          orgName: emailData.orgName,
          lineItems: emailLineItems,
          totalAmountCents: totalAmount,
          paidDate: new Date().toISOString().split("T")[0],
          logoUrl: emailData.logoUrl || undefined,
          gstEnabled: orgData?.gstEnabled ?? false,
          totalGstAmountCents: orgData?.gstEnabled
            ? emailLineItems.reduce((sum, item) => sum + calculateGst(item.amountCents, orgData.gstRateBps), 0)
            : 0,
          abnNumber: orgData?.abnNumber ?? undefined,
        }),
        replyTo: emailData.contactEmail || undefined,
        orgName: emailData.orgName,
      });
    }

    return;
  }

  const { transactionId, bookingId, organisationId, subscriptionId } = session.metadata ?? {};

  // Handle subscription payment
  if (subscriptionId) {
    // Idempotency check: skip if we already recorded this subscription payment
    const [existingSub] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.stripePaymentIntentId, paymentIntentId),
          eq(transactions.type, "SUBSCRIPTION")
        )
      );

    if (existingSub) return;

    // Fetch subscription data
    const [sub] = await db
      .select({
        id: subscriptions.id,
        memberId: subscriptions.memberId,
        amountCents: subscriptions.amountCents,
        organisationId: subscriptions.organisationId,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.organisationId, organisationId!)
        )
      );

    if (!sub) return;

    const amountCents = session.amount_total ?? sub.amountCents;

    // Look up org GST settings
    const [orgGst] = await db
      .select({
        gstEnabled: organisations.gstEnabled,
        gstRateBps: organisations.gstRateBps,
        abnNumber: organisations.abnNumber,
      })
      .from(organisations)
      .where(eq(organisations.id, sub.organisationId));

    const gstAmountCents = orgGst?.gstEnabled
      ? calculateGst(amountCents, orgGst.gstRateBps)
      : 0;

    // Create SUBSCRIPTION transaction
    await db.insert(transactions).values({
      organisationId: sub.organisationId,
      memberId: sub.memberId,
      type: "SUBSCRIPTION",
      amountCents: amountCents,
      stripePaymentIntentId: paymentIntentId,
      stripeCheckoutSessionId: session.id,
      gstAmountCents,
      description: `Membership subscription payment`,
    });

    // Update subscription: mark as PAID
    await db
      .update(subscriptions)
      .set({
        status: "PAID",
        paidAt: new Date(),
        stripePaymentIntentId: paymentIntentId,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscriptionId));

    // Get member email and org details for email
    const [emailData] = await db
      .select({
        email: members.email,
        orgName: organisations.name,
        contactEmail: organisations.contactEmail,
        logoUrl: organisations.logoUrl,
      })
      .from(members)
      .innerJoin(organisations, eq(organisations.id, sub.organisationId))
      .where(eq(members.id, sub.memberId));

    if (emailData) {
      sendEmail({
        to: emailData.email,
        subject: `Payment received — Membership Subscription`,
        template: React.createElement(PaymentReceivedEmail, {
          orgName: emailData.orgName,
          bookingReference: "Membership Subscription",
          amountCents: amountCents,
          paidDate: new Date().toISOString().split("T")[0],
          logoUrl: emailData.logoUrl || undefined,
          gstEnabled: orgGst?.gstEnabled ?? false,
          gstAmountCents,
          abnNumber: orgGst?.abnNumber ?? undefined,
        }),
        replyTo: emailData.contactEmail || undefined,
        orgName: emailData.orgName,
      });
    }

    return;
  }

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

  // Look up org GST settings
  const [orgGst] = await db
    .select({
      gstEnabled: organisations.gstEnabled,
      gstRateBps: organisations.gstRateBps,
      abnNumber: organisations.abnNumber,
    })
    .from(organisations)
    .where(eq(organisations.id, invoice.organisationId));

  const gstAmountCents = orgGst?.gstEnabled
    ? calculateGst(amountCents, orgGst.gstRateBps)
    : 0;

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
    gstAmountCents,
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
        gstEnabled: orgGst?.gstEnabled ?? false,
        gstAmountCents,
        abnNumber: orgGst?.abnNumber ?? undefined,
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
