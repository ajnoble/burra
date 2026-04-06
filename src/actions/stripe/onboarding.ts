"use server";

import { db } from "@/db/index";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getStripeClient } from "@/lib/stripe";
import { getSessionMember } from "@/lib/auth";
import { revalidatePath } from "next/cache";

type OnboardingResult = {
  success: boolean;
  url?: string;
  error?: string;
};

export async function createConnectAccount(
  organisationId: string,
  slug: string
): Promise<OnboardingResult> {
  const session = await getSessionMember(organisationId);
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "You do not have permission to manage payments" };
  }

  const [org] = await db
    .select({
      stripeConnectAccountId: organisations.stripeConnectAccountId,
    })
    .from(organisations)
    .where(eq(organisations.id, organisationId));

  if (org?.stripeConnectAccountId) {
    return { success: false, error: "This organisation already has a Stripe account connected" };
  }

  const stripe = getStripeClient();

  const account = await stripe.accounts.create({
    type: "express",
    country: "AU",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  await db
    .update(organisations)
    .set({
      stripeConnectAccountId: account.id,
      updatedAt: new Date(),
    })
    .where(eq(organisations.id, organisationId));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${appUrl}/${slug}/admin/settings/stripe/refresh`,
    return_url: `${appUrl}/${slug}/admin/settings/stripe/return`,
    type: "account_onboarding",
  });

  revalidatePath(`/${slug}/admin/settings`);

  return { success: true, url: accountLink.url };
}

export async function generateOnboardingLink(
  organisationId: string,
  slug: string
): Promise<OnboardingResult> {
  const session = await getSessionMember(organisationId);
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "You do not have permission to manage payments" };
  }

  const [org] = await db
    .select({
      stripeConnectAccountId: organisations.stripeConnectAccountId,
    })
    .from(organisations)
    .where(eq(organisations.id, organisationId));

  if (!org?.stripeConnectAccountId) {
    return { success: false, error: "No Stripe account found. Please connect first." };
  }

  const stripe = getStripeClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const accountLink = await stripe.accountLinks.create({
    account: org.stripeConnectAccountId,
    refresh_url: `${appUrl}/${slug}/admin/settings/stripe/refresh`,
    return_url: `${appUrl}/${slug}/admin/settings/stripe/return`,
    type: "account_onboarding",
  });

  return { success: true, url: accountLink.url };
}

type OnboardingStatus = {
  status: "not_started" | "pending" | "complete";
  accountId?: string;
};

export async function verifyOnboardingStatus(
  organisationId: string
): Promise<OnboardingStatus> {
  const [org] = await db
    .select({
      stripeConnectAccountId: organisations.stripeConnectAccountId,
      stripeConnectOnboardingComplete: organisations.stripeConnectOnboardingComplete,
    })
    .from(organisations)
    .where(eq(organisations.id, organisationId));

  if (!org?.stripeConnectAccountId) {
    return { status: "not_started" };
  }

  if (org.stripeConnectOnboardingComplete) {
    return { status: "complete", accountId: org.stripeConnectAccountId };
  }

  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(org.stripeConnectAccountId);

  if (account.charges_enabled) {
    await db
      .update(organisations)
      .set({
        stripeConnectOnboardingComplete: true,
        updatedAt: new Date(),
      })
      .where(eq(organisations.id, organisationId));

    return { status: "complete", accountId: org.stripeConnectAccountId };
  }

  return { status: "pending", accountId: org.stripeConnectAccountId };
}
