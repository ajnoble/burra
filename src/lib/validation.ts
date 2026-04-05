import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Invalid email address");

export const phoneSchema = z
  .string()
  .regex(/^[\d\s+()-]+$/, "Invalid phone number")
  .optional()
  .or(z.literal(""));

export const slugSchema = z
  .string()
  .min(2, "Slug must be at least 2 characters")
  .max(50, "Slug must be at most 50 characters")
  .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens");

export const dateSchema = z.coerce.date();

export const centsSchema = z.number().int("Amount must be a whole number (cents)").nonnegative("Amount cannot be negative");

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});
