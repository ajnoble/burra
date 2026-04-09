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
    // uploadedPath is set only when we upload a new file this call; used for
    // rollback if the subsequent DB write fails.
    let uploadedPath: string | null = null;
    // oldLogoPathToClean is captured before the DB write and deleted afterwards
    // (best-effort) to avoid deleting it before the write succeeds.
    let oldLogoPathToClean: string | null = null;

    if (parsed.data.removeLogo) {
      newLogoUrl = null;
      // Capture the old path so we can remove it from storage after the DB
      // write succeeds. We create a new client here; the upload branch below
      // also creates its own client. Two separate client instances keep each
      // branch self-contained and are cheap enough not to warrant a shared
      // reference across the wider function scope.
      const [existing] = await db
        .select({ logoUrl: organisations.logoUrl })
        .from(organisations)
        .where(eq(organisations.id, organisationId));
      if (existing?.logoUrl) {
        oldLogoPathToClean = existing.logoUrl.split("/org-logos/")[1] ?? null;
      }
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
      uploadedPath = path;

      // Fetch the old logo path now but do NOT delete it yet — deletion happens
      // after the DB write succeeds to prevent losing the old logo on DB failure.
      const [existing] = await db
        .select({ logoUrl: organisations.logoUrl })
        .from(organisations)
        .where(eq(organisations.id, organisationId));
      if (existing?.logoUrl) {
        oldLogoPathToClean = existing.logoUrl.split("/org-logos/")[1] ?? null;
      }
    }

    const updateSet: Partial<typeof organisations.$inferInsert> = {
      accentColor: parsed.data.accentColor,
    };
    if (newLogoUrl !== undefined) {
      updateSet.logoUrl = newLogoUrl;
    }

    // DB update wrapped so that a new upload can be rolled back on failure.
    try {
      await db
        .update(organisations)
        .set(updateSet)
        .where(eq(organisations.id, organisationId));
    } catch (dbErr) {
      if (uploadedPath) {
        // Best-effort rollback: remove the newly uploaded file so it does not
        // become an orphan. Any error here is swallowed — we are already on an
        // error path and the caller will receive the original DB error.
        try {
          const supabase = await createClient();
          await supabase.storage.from("org-logos").remove([uploadedPath]);
        } catch {
          // swallow rollback error
        }
      }
      throw dbErr;
    }

    // Post-commit: remove the old logo from storage (best-effort).
    // Deletion failures are swallowed — a storage leak is recoverable, but
    // surfacing a spurious error after a successful DB write is not acceptable.
    if (oldLogoPathToClean) {
      try {
        const supabase = await createClient();
        await supabase.storage.from("org-logos").remove([oldLogoPathToClean]);
      } catch {
        // swallow — storage leak is recoverable
      }
    }

    revalidatePath(`/`, "layout");
    return { success: true };
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}
