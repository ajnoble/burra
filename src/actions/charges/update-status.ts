"use server";

import { db } from "@/db/index";
import { oneOffCharges, transactions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, canAccessAdmin } from "@/lib/auth";

type StatusResult = { success: boolean; error?: string };

export async function waiveCharge(input: {
  chargeId: string;
  organisationId: string;
  reason: string;
  slug: string;
}): Promise<StatusResult> {
  const session = await getSessionMember(input.organisationId);
  if (!session || !canAccessAdmin(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  const [charge] = await db
    .select({ id: oneOffCharges.id, status: oneOffCharges.status })
    .from(oneOffCharges)
    .where(
      and(
        eq(oneOffCharges.id, input.chargeId),
        eq(oneOffCharges.organisationId, input.organisationId)
      )
    );

  if (!charge) return { success: false, error: "Charge not found" };
  if (charge.status !== "UNPAID") {
    return { success: false, error: "Only unpaid charges can be waived" };
  }

  await db
    .update(oneOffCharges)
    .set({
      status: "WAIVED",
      waivedReason: input.reason,
      updatedAt: new Date(),
    })
    .where(eq(oneOffCharges.id, input.chargeId));

  revalidatePath(`/${input.slug}/admin/charges`);
  return { success: true };
}

export async function cancelCharge(input: {
  chargeId: string;
  organisationId: string;
  slug: string;
}): Promise<StatusResult> {
  const session = await getSessionMember(input.organisationId);
  if (!session || !canAccessAdmin(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  const [charge] = await db
    .select({ id: oneOffCharges.id, status: oneOffCharges.status })
    .from(oneOffCharges)
    .where(
      and(
        eq(oneOffCharges.id, input.chargeId),
        eq(oneOffCharges.organisationId, input.organisationId)
      )
    );

  if (!charge) return { success: false, error: "Charge not found" };
  if (charge.status !== "UNPAID") {
    return { success: false, error: "Only unpaid charges can be cancelled" };
  }

  await db
    .update(oneOffCharges)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(oneOffCharges.id, input.chargeId));

  revalidatePath(`/${input.slug}/admin/charges`);
  return { success: true };
}

export async function markChargeAsPaid(input: {
  chargeId: string;
  organisationId: string;
  slug: string;
}): Promise<StatusResult> {
  const session = await getSessionMember(input.organisationId);
  if (!session || !canAccessAdmin(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  const [charge] = await db
    .select({
      id: oneOffCharges.id,
      status: oneOffCharges.status,
      organisationId: oneOffCharges.organisationId,
      memberId: oneOffCharges.memberId,
      amountCents: oneOffCharges.amountCents,
    })
    .from(oneOffCharges)
    .where(
      and(
        eq(oneOffCharges.id, input.chargeId),
        eq(oneOffCharges.organisationId, input.organisationId)
      )
    );

  if (!charge) return { success: false, error: "Charge not found" };
  if (charge.status !== "UNPAID") {
    return { success: false, error: "Only unpaid charges can be marked as paid" };
  }

  const [txn] = await db
    .insert(transactions)
    .values({
      organisationId: charge.organisationId,
      memberId: charge.memberId,
      type: "PAYMENT",
      amountCents: charge.amountCents,
      description: "Manual payment (cash/bank transfer)",
    })
    .returning();

  await db
    .update(oneOffCharges)
    .set({
      status: "PAID",
      paidAt: new Date(),
      transactionId: txn.id,
      updatedAt: new Date(),
    })
    .where(eq(oneOffCharges.id, input.chargeId));

  revalidatePath(`/${input.slug}/admin/charges`);
  return { success: true };
}
