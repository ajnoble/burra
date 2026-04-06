"use server";

import { db } from "@/db/index";
import { cancellationPolicies } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ruleSchema = z.object({
  daysBeforeCheckin: z.number().int().min(1, "Days must be at least 1"),
  forfeitPercentage: z.number().int().min(0).max(100, "Must be 0-100"),
});

const inputSchema = z.object({
  organisationId: z.string().min(1),
  id: z.string().min(1).optional(),
  name: z.string().min(1, "Policy name is required"),
  rules: z.array(ruleSchema).min(1, "At least one rule is required"),
  isDefault: z.boolean(),
});

type SavePolicyInput = z.infer<typeof inputSchema>;
type SavePolicyResult = { success: boolean; error?: string; id?: string };

export async function saveCancellationPolicy(
  input: SavePolicyInput
): Promise<SavePolicyResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const data = parsed.data;

  // Check for duplicate daysBeforeCheckin values
  const daysSet = new Set(data.rules.map((r) => r.daysBeforeCheckin));
  if (daysSet.size !== data.rules.length) {
    return { success: false, error: "Duplicate days before check-in values" };
  }

  // Sort rules by daysBeforeCheckin descending
  const sortedRules = [...data.rules].sort((a, b) => b.daysBeforeCheckin - a.daysBeforeCheckin);

  // If setting as default, clear isDefault on other policies
  if (data.isDefault) {
    await db
      .update(cancellationPolicies)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(cancellationPolicies.organisationId, data.organisationId));
  }

  if (data.id) {
    // Update existing
    const [updated] = await db
      .update(cancellationPolicies)
      .set({ name: data.name, rules: sortedRules, isDefault: data.isDefault, updatedAt: new Date() })
      .where(and(eq(cancellationPolicies.id, data.id), eq(cancellationPolicies.organisationId, data.organisationId)))
      .returning();

    if (!updated) {
      return { success: false, error: "Policy not found" };
    }

    revalidatePath(`/admin/settings`);
    return { success: true, id: updated.id };
  }

  // Create new
  const [created] = await db
    .insert(cancellationPolicies)
    .values({ organisationId: data.organisationId, name: data.name, rules: sortedRules, isDefault: data.isDefault })
    .returning();

  revalidatePath(`/admin/settings`);
  return { success: true, id: created.id };
}
