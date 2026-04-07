import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockSendEmail = vi.fn();

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockListUsers = vi.fn().mockResolvedValue({ data: { users: [] } });
const mockCreateUser = vi.fn().mockResolvedValue({
  data: { user: { id: "auth-user-id" } },
  error: null,
});
const mockGenerateLink = vi.fn().mockResolvedValue({
  data: { properties: { action_link: "https://example.com/invite" } },
  error: null,
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        listUsers: mockListUsers,
        createUser: mockCreateUser,
        generateLink: mockGenerateLink,
      },
    },
  }),
}));

// Track select call count so we can return different results for different queries
let selectCallCount = 0;

vi.mock("@/db/index", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return {
            returning: () => {
              mockReturning();
              return [{ id: "new-member-id", email: "james@example.com" }];
            },
            onConflictDoNothing: () => {},
          };
        },
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      const callIndex = selectCallCount++;
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              // callIndex 0: email uniqueness check => no existing member
              // callIndex 1: organisations query => return org details
              if (callIndex === 1) {
                return [
                  {
                    name: "Demo Club",
                    contactEmail: "admin@demo.com",
                    logoUrl: "https://example.com/logo.png",
                  },
                ];
              }
              return [];
            },
          };
        },
      };
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { createMember } from "../create";

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  mockListUsers.mockResolvedValue({ data: { users: [] } });
  mockCreateUser.mockResolvedValue({
    data: { user: { id: "auth-user-id" } },
    error: null,
  });
  mockGenerateLink.mockResolvedValue({
    data: { properties: { action_link: "https://example.com/invite" } },
    error: null,
  });
});

describe("createMember", () => {
  const validInput = {
    organisationId: "550e8400-e29b-41d4-a716-446655440000",
    slug: "demo",
    firstName: "James",
    lastName: "Mitchell",
    email: "james@example.com",
    membershipClassId: "660e8400-e29b-41d4-a716-446655440000",
  };

  it("inserts profile, member and org member records", async () => {
    await createMember(validInput);
    // Three inserts: profiles + members + organisationMembers
    expect(mockInsert).toHaveBeenCalledTimes(3);
  });

  it("rejects invalid email", async () => {
    const result = await createMember({
      ...validInput,
      email: "not-valid",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects missing firstName", async () => {
    const result = await createMember({
      ...validInput,
      firstName: "",
    });
    expect(result.success).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("sends an invite email for new auth users", async () => {
    await createMember(validInput);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    const emailArgs = mockSendEmail.mock.calls[0][0];
    expect(emailArgs.to).toBe("james@example.com");
    expect(emailArgs.subject).toBe("You're invited to Demo Club");
    expect(emailArgs.orgName).toBe("Demo Club");
    expect(emailArgs.replyTo).toBe("admin@demo.com");
    expect(emailArgs.template).toBeDefined();
    expect(emailArgs.template.type).toBeDefined();
  });

  it("sends a welcome email for existing auth users", async () => {
    mockListUsers.mockResolvedValueOnce({
      data: { users: [{ id: "existing-user-id", email: "james@example.com" }] },
    });

    await createMember(validInput);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);

    const emailArgs = mockSendEmail.mock.calls[0][0];
    expect(emailArgs.to).toBe("james@example.com");
    expect(emailArgs.subject).toBe("Welcome to Demo Club");
  });
});
