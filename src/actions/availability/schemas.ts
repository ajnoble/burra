import { z } from "zod";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format");

const baseOverrideSchema = z.object({
  lodgeId: z.string().uuid(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  type: z.enum(["CLOSURE", "REDUCTION", "EVENT"]),
  bedReduction: z.number().int().positive().optional(),
  reason: z.string().trim().optional(),
});

export const createOverrideSchema = baseOverrideSchema.superRefine((data, ctx) => {
  if (data.endDate < data.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End date must be on or after start date",
      path: ["endDate"],
    });
  }
  if (data.type === "REDUCTION" && (data.bedReduction === undefined || data.bedReduction <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Bed reduction is required and must be positive for REDUCTION type",
      path: ["bedReduction"],
    });
  }
  if (data.type === "CLOSURE" && data.bedReduction !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Bed reduction must not be set for CLOSURE type",
      path: ["bedReduction"],
    });
  }
  if (data.type === "EVENT" && data.bedReduction !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Bed reduction must not be set for EVENT type",
      path: ["bedReduction"],
    });
  }
  if (data.type === "EVENT" && (!data.reason || data.reason.trim().length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Reason is required for EVENT type (used as the event label)",
      path: ["reason"],
    });
  }
});

export const updateOverrideSchema = z
  .object({
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    type: z.enum(["CLOSURE", "REDUCTION", "EVENT"]).optional(),
    bedReduction: z.number().int().positive().optional().nullable(),
    reason: z.string().trim().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.startDate && data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End date must be on or after start date",
        path: ["endDate"],
      });
    }
  });

export const validateBookingDatesSchema = z
  .object({
    lodgeId: z.string().uuid(),
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    bookingRoundId: z.string().uuid(),
    memberId: z.string().uuid(),
  })
  .superRefine((data, ctx) => {
    if (data.checkOut <= data.checkIn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Check-out must be after check-in",
        path: ["checkOut"],
      });
    }
  });
