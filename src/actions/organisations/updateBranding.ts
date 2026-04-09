"use server";

import { z } from "zod";
import { db } from "@/db";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireSession, requireRole, authErrorToResult } from "@/lib/auth-guards";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

export async function updateBranding(
  organisationId: string,
  input: BrandingInput,
  logoFile?: File | null
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await requireSession(organisationId);
    requireRole(session, "ADMIN");

    const parsed = brandingSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid branding input",
      };
    }

    let newLogoUrl: string | null | undefined = undefined;

    if (parsed.data.removeLogo) {
      newLogoUrl = null;
    } else if (logoFile && logoFile.size > 0) {
      if (logoFile.size > MAX_LOGO_BYTES) {
        return {
          success: false,
          error: `Logo must be under ${MAX_LOGO_BYTES / 1024}KB`,
        };
      }
      if (
        !ALLOWED_LOGO_MIME.includes(
          logoFile.type as (typeof ALLOWED_LOGO_MIME)[number]
        )
      ) {
        return { success: false, error: "Logo must be PNG, SVG, or JPEG" };
      }

      const ext =
        logoFile.type === "image/svg+xml"
          ? "svg"
          : logoFile.type === "image/png"
            ? "png"
            : "jpg";
      const path = `${organisationId}/logo-${Date.now()}.${ext}`;

      const supabase = await createClient();
      const { error: uploadErr } = await supabase.storage
        .from("org-logos")
        .upload(path, logoFile, { upsert: false, contentType: logoFile.type });
      if (uploadErr) {
        return {
          success: false,
          error: `Upload failed: ${uploadErr.message}`,
        };
      }

      const { data: publicUrlData } = supabase.storage
        .from("org-logos")
        .getPublicUrl(path);
      newLogoUrl = publicUrlData.publicUrl;

      const [existing] = await db
        .select({ logoUrl: organisations.logoUrl })
        .from(organisations)
        .where(eq(organisations.id, organisationId));
      if (existing?.logoUrl) {
        const oldPath = existing.logoUrl.split("/org-logos/")[1];
        if (oldPath) {
          await supabase.storage.from("org-logos").remove([oldPath]);
        }
      }
    }

    const updateSet: Partial<typeof organisations.$inferInsert> = {
      accentColor: parsed.data.accentColor,
    };
    if (newLogoUrl !== undefined) {
      updateSet.logoUrl = newLogoUrl;
    }

    await db
      .update(organisations)
      .set(updateSet)
      .where(eq(organisations.id, organisationId));

    revalidatePath(`/`, "layout");
    return { success: true };
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}
