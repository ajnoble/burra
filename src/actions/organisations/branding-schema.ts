import { z } from "zod";

export const MAX_LOGO_BYTES = 500 * 1024;
export const ALLOWED_LOGO_MIME = [
  "image/png",
  "image/svg+xml",
  "image/jpeg",
] as const;

export const brandingSchema = z.object({
  accentColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "Must be a 6-character hex color like #38694a")
    .nullable(),
  removeLogo: z.boolean().optional().default(false),
});

export type BrandingInput = z.input<typeof brandingSchema>;
