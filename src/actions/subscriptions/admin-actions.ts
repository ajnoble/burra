"use server";

import { db } from "@/db/index";
import { subscriptions, transactions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type WaiveInput = {
  subscriptionId: string;
  organisationId: string;
  reason: string;
  slug: string;
};

export async function waiveSubscription(
  input: WaiveInput
): Promise<{ success: boolean; error?: string }> {
  const reason = input.reason.trim();
  if (!reason) {
    return { success: false, error: "Reason is required" };
  }

  const [updated] = await db
    .update(subscriptions)
    .set({ status: "WAIVED", waivedReason: reason, updatedAt: new Date() })
    .where(
      and(
        eq(subscriptions.id, input.subscriptionId),
        eq(subscriptions.organisationId, input.organisationId)
      )
    )
    .returning();

  if (!updated) {
    return { success: false, error: "Subscription not found" };
  }

  revalidatePath(`/${input.slug}/admin/subscriptions`);
  return { success: true };
}

type AdjustAmountInput = {
  subscriptionId: string;
  organisationId: string;
  amountCents: number;
  slug: string;
};

export async function adjustSubscriptionAmount(
  input: AdjustAmountInput
): Promise<{ success: boolean; error?: string }> {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    return { success: false, error: "Amount must be a non-negative integer (in cents)" };
  }

  const [updated] = await db
    .update(subscriptions)
    .set({ amountCents: input.amountCents, updatedAt: new Date() })
    .where(
      and(
        eq(subscriptions.id, input.subscriptionId),
        eq(subscriptions.organisationId, input.organisationId)
      )
    )
    .returning();

  if (!updated) {
    return { success: false, error: "Subscription not found" };
  }

  revalidatePath(`/${input.slug}/admin/subscriptions`);
  return { success: true };
}

type RecordOfflinePaymentInput = {
  subscriptionId: string;
  organisationId: string;
  adminName: string;
  slug: string;
};

export async function recordOfflinePayment(
  input: RecordOfflinePaymentInput
): Promise<{ success: boolean; error?: string }> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.id, input.subscriptionId),
        eq(subscriptions.organisationId, input.organisationId)
      )
    );

  if (!sub) {
    return { success: false, error: "Subscription not found" };
  }

  const now = new Date();

  await db
    .update(subscriptions)
    .set({ status: "PAID", paidAt: now, updatedAt: now })
    .where(
      and(
        eq(subscriptions.id, input.subscriptionId),
        eq(subscriptions.organisationId, input.organisationId)
      )
    );

  await db.insert(transactions).values({
    organisationId: input.organisationId,
    memberId: sub.memberId,
    type: "SUBSCRIPTION",
    amountCents: sub.amountCents,
    description: `Offline payment recorded by ${input.adminName}`,
  });

  revalidatePath(`/${input.slug}/admin/subscriptions`);
  return { success: true };
}
