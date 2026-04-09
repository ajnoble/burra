import { describe, it, expect, beforeEach } from "vitest";
import { getSeasonForDates } from "../validation-helpers";
import { getTestDb } from "../../../db/test-setup";
import { organisations, lodges, seasons } from "../../../db/schema";

describe("getSeasonForDates (integration)", () => {
  let orgId: string;
  let lodgeId: string;

  beforeEach(async () => {
    const db = await getTestDb();

    const [org] = await db
      .insert(organisations)
      .values({
        name: "Test Organisation",
        slug: "test-org",
      })
      .returning();
    orgId = org.id;

    const [lodge] = await db
      .insert(lodges)
      .values({
        organisationId: orgId,
        name: "Test Lodge",
        totalBeds: 20,
      })
      .returning();
    lodgeId = lodge.id;

    await db.insert(seasons).values({
      organisationId: orgId,
      name: "Winter 2026",
      startDate: "2026-06-01",
      endDate: "2026-09-30",
      isActive: true,
    });
  });

  it("returns the season when check-in and check-out fall within it", async () => {
    const season = await getSeasonForDates(lodgeId, "2026-07-01", "2026-07-08");
    expect(season).not.toBeNull();
    expect(season!.name).toBe("Winter 2026");
  });

  it("returns null when dates fall outside any active season", async () => {
    const season = await getSeasonForDates(lodgeId, "2026-12-01", "2026-12-08");
    expect(season).toBeNull();
  });

  it("returns null when the spanning season is inactive", async () => {
    const db = await getTestDb();
    // Add an extra inactive season covering the queried dates
    await db.insert(seasons).values({
      organisationId: orgId,
      name: "Summer 2026 (inactive)",
      startDate: "2026-11-01",
      endDate: "2026-12-31",
      isActive: false,
    });

    const season = await getSeasonForDates(lodgeId, "2026-11-15", "2026-11-20");
    expect(season).toBeNull();
  });

  it("sees no rows from prior test cases — isolation check", async () => {
    const db = await getTestDb();
    const allSeasons = await db.select().from(seasons);
    // afterEach truncation means only this test's beforeEach seed is present
    expect(allSeasons).toHaveLength(1);
    expect(allSeasons[0].name).toBe("Winter 2026");
  });
});
