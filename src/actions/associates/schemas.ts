import { z } from "zod";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format");

export const createAssociateSchema = z.object({
  organisationId: z.string().uuid(),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Valid email is required"),
  phone: z.string().max(30).optional(),
  dateOfBirth: isoDateSchema.optional(),
});
export type CreateAssociateInput = z.infer<typeof createAssociateSchema>;

export const updateAssociateSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(30).optional().or(z.literal("")),
  dateOfBirth: isoDateSchema.optional().or(z.literal("")),
});
export type UpdateAssociateInput = z.infer<typeof updateAssociateSchema>;
