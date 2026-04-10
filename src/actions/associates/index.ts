"use server";

import { db } from "@/db/index";
import { associates } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession, authErrorToResult } from "@/lib/auth-guards";
import {
  createAssociateSchema,
  updateAssociateSchema,
  type CreateAssociateInput,
  type UpdateAssociateInput,
} from "./schemas";

type ActionResult<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };

export async function createAssociate(
  input: CreateAssociateInput & { slug: string }
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  try {
    const session = await requireSession(input.organisationId);
    const data = createAssociateSchema.parse(input);

    const [created] = await db
      .insert(associates)
      .values({
        organisationId: data.organisationId,
        ownerMemberId: session.memberId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone ?? null,
        dateOfBirth: data.dateOfBirth ?? null,
      })
      .returning();

    revalidatePath(`/${input.slug}/associates`);
    return { success: true, id: created.id };
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}

export async function updateAssociate(
  input: UpdateAssociateInput & { organisationId: string; slug: string }
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await requireSession(input.organisationId);
    const data = updateAssociateSchema.parse(input);

    // Verify ownership: only the owner can update their associate
    const [existing] = await db
      .select()
      .from(associates)
      .where(
        and(
          eq(associates.id, data.id),
          eq(associates.organisationId, input.organisationId),
          eq(associates.isDeleted, false)
        )
      );

    if (!existing) {
      return { success: false, error: "Associate not found" };
    }

    if (existing.ownerMemberId !== session.memberId) {
      return { success: false, error: "You can only update your own associates" };
    }

    await db
      .update(associates)
      .set({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || null,
        dateOfBirth: data.dateOfBirth || null,
        updatedAt: new Date(),
      })
      .where(eq(associates.id, data.id));

    revalidatePath(`/${input.slug}/associates`);
    return { success: true };
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}

export async function deleteAssociate(
  id: string,
  organisationId: string,
  slug: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await requireSession(organisationId);

    // Verify ownership
    const [existing] = await db
      .select()
      .from(associates)
      .where(
        and(
          eq(associates.id, id),
          eq(associates.organisationId, organisationId),
          eq(associates.isDeleted, false)
        )
      );

    if (!existing) {
      return { success: false, error: "Associate not found" };
    }

    if (existing.ownerMemberId !== session.memberId) {
      return { success: false, error: "You can only delete your own associates" };
    }

    await db
      .update(associates)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(associates.id, id));

    revalidatePath(`/${slug}/associates`);
    return { success: true };
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}

export async function getMyAssociates(organisationId: string, memberId: string) {
  return db
    .select()
    .from(associates)
    .where(
      and(
        eq(associates.organisationId, organisationId),
        eq(associates.ownerMemberId, memberId),
        eq(associates.isDeleted, false)
      )
    );
}
