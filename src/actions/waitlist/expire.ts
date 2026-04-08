"use server";

import { db } from "@/db/index";
import { waitlistEntries } from "@/db/schema";
import { eq, and, lt } from "drizzle-orm";

export async function expireWaitlistEntries() {
  const now = new Date();

  await db
    .update(waitlistEntries)
    .set({ status: "EXPIRED" })
    .where(
      and(
        eq(waitlistEntries.status, "NOTIFIED"),
        lt(waitlistEntries.expiresAt, now)
      )
    );

  return { success: true };
}
