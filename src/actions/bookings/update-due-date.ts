"use server";

import { db } from "@/db/index";
import { bookings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, canAccessAdmin } from "@/lib/auth";

type UpdateDueDateInput = {
  bookingId: string;
  organisationId: string;
  balanceDueDate: string | null;
  slug: string;
};

export async function updateBookingDueDate(
  input: UpdateDueDateInput
): Promise<{ success: boolean; error?: string }> {
  const session = await getSessionMember(input.organisationId);
  if (!session || !canAccessAdmin(session.role)) {
    return { success: false, error: "Not authorised" };
  }

  await db
    .update(bookings)
    .set({
      balanceDueDate: input.balanceDueDate,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bookings.id, input.bookingId),
        eq(bookings.organisationId, input.organisationId)
      )
    );

  revalidatePath(`/${input.slug}/admin/bookings/${input.bookingId}`);

  return { success: true };
}
