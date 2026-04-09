import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, truncateAll } from "../test-db";
import { organisations } from "../schema";

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

describe("truncateAll", () => {
  it("removes all rows from every table", async () => {
    const { db } = await createTestDb();
    await db.insert(organisations).values({ name: "Test Org", slug: "test-org" });
    const before = await db.select().from(organisations);
    expect(before).toHaveLength(1);

    await truncateAll(db);

    const after = await db.select().from(organisations);
    expect(after).toHaveLength(0);
  });
});
