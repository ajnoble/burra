import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../test-db";

describe("createTestDb", () => {
  it("returns a drizzle client that can run SELECT 1", async () => {
    const { db } = await createTestDb();
    const result = await db.execute(sql`SELECT 1 AS n`);
    // pglite returns rows under `.rows`
    expect((result as unknown as { rows: { n: number }[] }).rows[0].n).toBe(1);
  });

  it("has run migrations — organisations table exists", async () => {
    const { db } = await createTestDb();
    const result = await db.execute(
      sql`SELECT to_regclass('public.organisations') AS tbl`
    );
    const row = (result as unknown as { rows: { tbl: string | null }[] }).rows[0];
    expect(row.tbl).toBe("organisations");
  });
});
