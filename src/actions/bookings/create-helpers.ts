import { createBookingSchema, type CreateBookingInput } from "./schemas";
import { db } from "@/db/index";
import { bookingRounds } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Validate the booking input against the Zod schema.
 * Exported for testing.
 */
export function validateCreateBookingInput(input: unknown): {
  valid: boolean;
  errors: string[];
  data?: CreateBookingInput;
} {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((i) => i.message),
    };
  }
  return { valid: true, errors: [], data: parsed.data };
}

export async function getBalanceDueDateForRound(
  bookingRoundId: string
): Promise<string | null> {
  const [round] = await db
    .select({ balanceDueDate: bookingRounds.balanceDueDate })
    .from(bookingRounds)
    .where(eq(bookingRounds.id, bookingRoundId));

  return round?.balanceDueDate ?? null;
}
