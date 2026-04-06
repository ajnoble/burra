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

export const createMemberSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: emailSchema,
  membershipClassId: z.string().uuid(),
  phone: phoneSchema,
  dateOfBirth: z.string().optional().or(z.literal("")),
  memberNumber: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  role: z
    .enum(["MEMBER", "BOOKING_OFFICER", "COMMITTEE", "ADMIN"])
    .default("MEMBER"),
  isFinancial: z.boolean().default(true),
});

export const updateMemberSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").optional(),
  lastName: z.string().trim().min(1, "Last name is required").optional(),
  email: emailSchema.optional(),
  membershipClassId: z.string().uuid().optional(),
  phone: phoneSchema,
  dateOfBirth: z.string().optional().or(z.literal("")),
  memberNumber: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export const financialStatusChangeSchema = z.object({
  isFinancial: z.boolean(),
  reason: z.string().trim().min(1, "Reason is required"),
});
