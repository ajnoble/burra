"use server";

import { db } from "@/db/index";
import { subscriptions, transactions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, canAccessAdmin } from "@/lib/auth";

type ActionResult = { success: boolean; error?: string };

async function requireAdmin(organisationId: string): Promise<ActionResult | null> {
  const session = await getSessionMember(organisationId);
  if (!session || !canAccessAdmin(session.role)) {
    return { success: false, error: "Not authorised" };
  }
  return null;
}

type WaiveInput = {
  subscriptionId: string;
  organisationId: string;
  reason: string;
  slug: string;
};

export async function waiveSubscription(
  input: WaiveInput
): Promise<ActionResult> {
  const authError = await requireAdmin(input.organisationId);
  if (authError) return authError;

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
): Promise<ActionResult> {
  const authError = await requireAdmin(input.organisationId);
  if (authError) return authError;

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
): Promise<ActionResult> {
  const authError = await requireAdmin(input.organisationId);
  if (authError) return authError;

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

  // Use transaction for atomicity — mark paid + create record together
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({ status: "PAID", paidAt: now, updatedAt: now })
      .where(
        and(
          eq(subscriptions.id, input.subscriptionId),
          eq(subscriptions.organisationId, input.organisationId)
        )
      );

    await tx.insert(transactions).values({
      organisationId: input.organisationId,
      memberId: sub.memberId,
      type: "SUBSCRIPTION",
      amountCents: sub.amountCents,
      description: `Offline payment recorded by ${input.adminName}`,
    });
  });

  revalidatePath(`/${input.slug}/admin/subscriptions`);
  return { success: true };
}
