"use server";

import { db } from "@/db/index";
import { bookings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type AdminNotesInput = {
  bookingId: string;
  organisationId: string;
  notes: string;
  slug: string;
};

type AdminNotesResult = { success: boolean; error?: string };

export async function updateAdminNotes(
  input: AdminNotesInput
): Promise<AdminNotesResult> {
  const [updated] = await db
    .update(bookings)
    .set({ adminNotes: input.notes, updatedAt: new Date() })
    .where(
      and(eq(bookings.id, input.bookingId), eq(bookings.organisationId, input.organisationId))
    )
    .returning();

  if (!updated) {
    return { success: false, error: "Booking not found" };
  }

  revalidatePath(`/${input.slug}/admin/bookings/${input.bookingId}`);
  return { success: true };
}
