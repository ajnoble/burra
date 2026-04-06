import { createBookingSchema, type CreateBookingInput } from "./schemas";

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
