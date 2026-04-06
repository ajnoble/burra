import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();

// Track how many times select has been called so we can return different data
// for the season query vs. the eligible members query.
let selectCallCount = 0;

// Default eligible members list – override per-test as needed.
let eligibleMembersResult: unknown[] = [
  {
    memberId: "member-1",
    amountCents: 15000,
  },
  {
    memberId: "member-2",
    amountCents: 15000,
  },
];

// Default season result – override per-test.
let seasonResult: unknown[] = [
  { id: "season-1", startDate: "2027-06-01" },
];

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      const callIndex = selectCallCount++;
      return {
        from: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              leftJoin: () => ({
                where: () => {
                  // Second select is the eligible members query
                  return eligibleMembersResult;
                },
              }),
            }),
          }),
          where: () => {
            // First select is the season lookup
            if (callIndex === 0) return seasonResult;
            return [];
          },
        }),
      };
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return Promise.resolve();
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  seasons: { id: "id", organisationId: "organisation_id", startDate: "start_date" },
  members: { id: "id", membershipClassId: "membership_class_id" },
  membershipClasses: { id: "id", annualFeeCents: "annual_fee_cents" },
  organisationMembers: { memberId: "member_id", organisationId: "organisation_id", isActive: "is_active" },
  subscriptions: { id: "id", memberId: "member_id", seasonId: "season_id", organisationId: "organisation_id" },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  isNotNull: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  canAccessAdmin: vi.fn().mockReturnValue(true),
}));

// ---------------------------------------------------------------------------
// Import the action AFTER mocks are established
// ---------------------------------------------------------------------------
import { generateSubscriptions } from "../generate";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  // Reset to defaults
  seasonResult = [{ id: "season-1", startDate: "2027-06-01" }];
  eligibleMembersResult = [
    { memberId: "member-1", amountCents: 15000 },
    { memberId: "member-2", amountCents: 15000 },
  ];
});

const baseInput = {
  organisationId: "550e8400-e29b-41d4-a716-446655440000",
  seasonId: "660e8400-e29b-41d4-a716-446655440000",
  slug: "demo",
};

describe("generateSubscriptions", () => {
  it("returns error when season is not found", async () => {
    seasonResult = [];

    const result = await generateSubscriptions(baseInput);

    expect(result.success).toBe(false);
    expect(result).toEqual({ success: false, error: "Season not found" });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("generates subscriptions for eligible members", async () => {
    const result = await generateSubscriptions(baseInput);

    expect(result.success).toBe(true);
    expect(result).toHaveProperty("generated", 2);
    expect(mockInsert).toHaveBeenCalledTimes(1);

    const insertedValues = mockValues.mock.calls[0][0] as Array<{
      organisationId: string;
      memberId: string;
      seasonId: string;
      amountCents: number;
      dueDate: string;
      status: string;
    }>;
    expect(insertedValues).toHaveLength(2);
    expect(insertedValues[0].status).toBe("UNPAID");
    expect(insertedValues[0].dueDate).toBe("2027-06-01");
    expect(insertedValues[0].organisationId).toBe(baseInput.organisationId);
    expect(insertedValues[0].seasonId).toBe(baseInput.seasonId);
  });

  it("returns generated: 0 when no eligible members", async () => {
    eligibleMembersResult = [];

    const result = await generateSubscriptions(baseInput);

    expect(result.success).toBe(true);
    expect(result).toHaveProperty("generated", 0);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("skips members who already have a subscription (idempotent) — returns generated: 0", async () => {
    // Eligible members query returns empty because the LEFT JOIN / WHERE IS NULL
    // filters out members who already have subscriptions. The action sees no
    // eligible members and skips the insert.
    eligibleMembersResult = [];

    const result = await generateSubscriptions(baseInput);

    expect(result.success).toBe(true);
    expect(result).toHaveProperty("generated", 0);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
