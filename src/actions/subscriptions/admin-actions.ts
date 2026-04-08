"use server";

import { db } from "@/db/index";
import { subscriptions, transactions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, canAccessAdmin } from "@/lib/auth";
import type { SessionMember } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-log";

type ActionResult = { success: boolean; error?: string };

async function requireAdmin(organisationId: string): Promise<{ error: ActionResult } | { session: SessionMember }> {
  const session = await getSessionMember(organisationId);
  if (!session || !canAccessAdmin(session.role)) {
    return { error: { success: false, error: "Not authorised" } };
  }
  return { session };
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
  const auth = await requireAdmin(input.organisationId);
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const reason = input.reason.trim();
  if (!reason) {
    return { success: false, error: "Reason is required" };
  }

  const [existing] = await db.select({ status: subscriptions.status }).from(subscriptions).where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.organisationId, input.organisationId)));

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

  createAuditLog({
    organisationId: input.organisationId, actorMemberId: session.memberId,
    action: "SUBSCRIPTION_WAIVED", entityType: "subscription", entityId: input.subscriptionId,
    previousValue: { status: existing?.status ?? null }, newValue: { status: "WAIVED", waivedReason: reason },
  }).catch(console.error);

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
  const auth = await requireAdmin(input.organisationId);
  if ("error" in auth) return auth.error;
  const { session } = auth;

  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    return { success: false, error: "Amount must be a non-negative integer (in cents)" };
  }

  const [existing] = await db.select({ amountCents: subscriptions.amountCents }).from(subscriptions).where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.organisationId, input.organisationId)));

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

  createAuditLog({
    organisationId: input.organisationId, actorMemberId: session.memberId,
    action: "SUBSCRIPTION_AMOUNT_ADJUSTED", entityType: "subscription", entityId: input.subscriptionId,
    previousValue: { amountCents: existing?.amountCents ?? null }, newValue: { amountCents: input.amountCents },
  }).catch(console.error);

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
  const auth = await requireAdmin(input.organisationId);
  if ("error" in auth) return auth.error;
  const { session } = auth;

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

  createAuditLog({
    organisationId: input.organisationId, actorMemberId: session.memberId,
    action: "SUBSCRIPTION_PAID_OFFLINE", entityType: "subscription", entityId: input.subscriptionId,
    previousValue: { status: sub.status }, newValue: { status: "PAID", adminName: input.adminName },
  }).catch(console.error);

  revalidatePath(`/${input.slug}/admin/subscriptions`);
  return { success: true };
}
