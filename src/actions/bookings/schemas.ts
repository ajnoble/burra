import { z } from "zod";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format");

const bookingGuestSchema = z
  .object({
    memberId: z.string().uuid().optional(),
    associateId: z.string().uuid().optional(),
    bedId: z.string().uuid().optional(),
    roomId: z.string().uuid().optional(),
    portaCotRequested: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    const hasMember = !!data.memberId;
    const hasAssociate = !!data.associateId;
    if (hasMember === hasAssociate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Guest must have exactly one of memberId or associateId",
      });
    }
    if (!data.portaCotRequested && !data.bedId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "bedId is required unless portaCotRequested is true",
        path: ["bedId"],
      });
    }
  });

export const createBookingSchema = z
  .object({
    organisationId: z.string().uuid(),
    lodgeId: z.string().uuid(),
    bookingRoundId: z.string().uuid(),
    checkInDate: isoDateSchema,
    checkOutDate: isoDateSchema,
    guests: z.array(bookingGuestSchema).min(1, "At least one guest is required"),
  })
  .superRefine((data, ctx) => {
    if (data.checkOutDate <= data.checkInDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Check-out must be after check-in",
        path: ["checkOutDate"],
      });
    }
  });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const pricingInputSchema = z.object({
  lodgeId: z.string().uuid(),
  checkInDate: isoDateSchema,
  checkOutDate: isoDateSchema,
  guestMemberIds: z.array(z.string().uuid()).min(1, "At least one guest is required"),
});

export type PricingInput = z.infer<typeof pricingInputSchema>;

export const bedHoldInputSchema = z
  .object({
    lodgeId: z.string().uuid(),
    bedId: z.string().uuid(),
    bookingRoundId: z.string().uuid(),
    checkInDate: isoDateSchema,
    checkOutDate: isoDateSchema,
  })
  .superRefine((data, ctx) => {
    if (data.checkOutDate <= data.checkInDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Check-out must be after check-in",
        path: ["checkOutDate"],
      });
    }
  });

export type BedHoldInput = z.infer<typeof bedHoldInputSchema>;
