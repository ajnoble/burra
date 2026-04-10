"use server";

import { db } from "@/db/index";
import { lodges, rooms, beds } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession, requireRole, authErrorToResult } from "@/lib/auth-guards";

type AuthErrorResult = { success: false; error: string };

// Lodge actions
const lodgeSchema = z.object({
  organisationId: z.string().uuid(),
  name: z.string().min(1).max(200),
  address: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  totalBeds: z.number().int().positive(),
  portaCotCount: z.number().int().min(0).default(0),
});

export async function createLodge(
  input: z.infer<typeof lodgeSchema> & { slug: string }
): Promise<typeof lodges.$inferSelect | AuthErrorResult> {
  try {
    const session = await requireSession(input.organisationId);
    requireRole(session, "ADMIN");

    const data = lodgeSchema.parse(input);
    const [created] = await db
      .insert(lodges)
      .values({
        organisationId: data.organisationId,
        name: data.name,
        address: data.address || null,
        description: data.description || null,
        totalBeds: data.totalBeds,
      })
      .returning();

    revalidatePath(`/${input.slug}/admin/lodges`);
    return created;
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}

export async function updateLodge(
  input: { id: string; slug: string } & z.infer<typeof lodgeSchema>
): Promise<typeof lodges.$inferSelect | AuthErrorResult | undefined> {
  try {
    const session = await requireSession(input.organisationId);
    requireRole(session, "ADMIN");

    const data = lodgeSchema.parse(input);
    const [updated] = await db
      .update(lodges)
      .set({
        name: data.name,
        address: data.address || null,
        description: data.description || null,
        totalBeds: data.totalBeds,
        portaCotCount: data.portaCotCount,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lodges.id, input.id),
          eq(lodges.organisationId, input.organisationId)
        )
      )
      .returning();

    revalidatePath(`/${input.slug}/admin/lodges`);
    return updated;
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}

// Room actions
const roomSchema = z.object({
  lodgeId: z.string().uuid(),
  name: z.string().min(1).max(100),
  floor: z.string().optional().or(z.literal("")),
  capacity: z.number().int().positive(),
  description: z.string().optional().or(z.literal("")),
  sortOrder: z.number().int().default(0),
});

export async function createRoom(
  input: z.infer<typeof roomSchema> & { slug: string }
) {
  const data = roomSchema.parse(input);
  const [room] = await db
    .insert(rooms)
    .values({
      lodgeId: data.lodgeId,
      name: data.name,
      floor: data.floor || null,
      capacity: data.capacity,
      description: data.description || null,
      sortOrder: data.sortOrder,
    })
    .returning();

  // Auto-create beds for the room
  for (let i = 0; i < data.capacity; i++) {
    await db.insert(beds).values({
      roomId: room.id,
      label: `Bed ${i + 1}`,
      sortOrder: i,
    });
  }

  revalidatePath(`/${input.slug}/admin/lodges`);
  return room;
}

export async function updateRoom(
  input: { id: string; slug: string } & z.infer<typeof roomSchema>
) {
  const data = roomSchema.parse(input);
  const [updated] = await db
    .update(rooms)
    .set({
      name: data.name,
      floor: data.floor || null,
      capacity: data.capacity,
      description: data.description || null,
      sortOrder: data.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(rooms.id, input.id))
    .returning();

  revalidatePath(`/${input.slug}/admin/lodges`);
  return updated;
}

export async function deleteRoom(id: string, slug: string) {
  // Delete beds first, then room
  await db.delete(beds).where(eq(beds.roomId, id));
  await db.delete(rooms).where(eq(rooms.id, id));
  revalidatePath(`/${slug}/admin/lodges`);
}

export async function updatePortaCotCount(
  input: { id: string; organisationId: string; portaCotCount: number; slug: string }
): Promise<typeof lodges.$inferSelect | AuthErrorResult | undefined> {
  try {
    const session = await requireSession(input.organisationId);
    requireRole(session, "ADMIN");

    const count = z.number().int().min(0).parse(input.portaCotCount);
    const [updated] = await db
      .update(lodges)
      .set({ portaCotCount: count, updatedAt: new Date() })
      .where(
        and(
          eq(lodges.id, input.id),
          eq(lodges.organisationId, input.organisationId)
        )
      )
      .returning();

    revalidatePath(`/${input.slug}/admin/lodges`);
    return updated;
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}

// Bed actions
export async function updateBedLabel(
  id: string,
  label: string,
  slug: string
) {
  await db.update(beds).set({ label }).where(eq(beds.id, id));
  revalidatePath(`/${slug}/admin/lodges`);
}
