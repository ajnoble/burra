import { db } from "@/db/index";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cache } from "react";

/**
 * Resolve an organisation from its slug. Cached per request.
 */
export const getOrgBySlug = cache(async (slug: string) => {
  const [org] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.slug, slug))
    .limit(1);
  return org ?? null;
});
