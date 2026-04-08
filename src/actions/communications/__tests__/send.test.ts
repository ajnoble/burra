import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock functions
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInnerJoin = vi.fn();
const mockLeftJoin = vi.fn();
const mockOrderBy = vi.fn();

const mockCommunication = {
  id: "comm-1",
  organisationId: "org-1",
  subject: "Test Announcement",
  bodyMarkdown: "Hello **everyone**",
  smsBody: null,
  channel: "EMAIL" as const,
  status: "DRAFT",
  filters: {},
  recipientCount: null,
  createdByMemberId: "admin-1",
  sentAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockOrg = {
  id: "org-1",
  name: "Test Org",
  contactEmail: "contact@test.org",
  logoUrl: "https://test.org/logo.png",
  smsFromNumber: "+61400000000",
};

const testMembers = [
  {
    members: {
      id: "m1",
      firstName: "Alice",
      lastName: "Adams",
      email: "alice@example.com",
      phone: "0400000001",
      membershipClassId: "mc-1",
      isFinancial: true,
      organisationId: "org-1",
    },
    organisationMembers: { role: "MEMBER", isActive: true },
    membershipClasses: { name: "Full" },
  },
  {
    members: {
      id: "m2",
      firstName: "Bob",
      lastName: "Brown",
      email: "bob@example.com",
      phone: "0400000002",
      membershipClassId: "mc-1",
      isFinancial: true,
      organisationId: "org-1",
    },
    organisationMembers: { role: "ADMIN", isActive: true },
    membershipClasses: { name: "Full" },
  },
];

// Track which select call we're on to return different data
let selectCallCount = 0;
let updateCallCount = 0;

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
              return [];
            },
          };
        },
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      updateCallCount++;
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return {
                returning: () => {
                  mockReturning();
                  return [mockCommunication];
                },
              };
            },
          };
        },
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      selectCallCount++;
      const currentCall = selectCallCount;
      const chain: Record<string, (...a: unknown[]) => unknown> = {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return chain;
        },
        innerJoin: (...jArgs: unknown[]) => {
          mockInnerJoin(...jArgs);
          return chain;
        },
        leftJoin: (...jArgs: unknown[]) => {
          mockLeftJoin(...jArgs);
          return chain;
        },
        where: (...wArgs: unknown[]) => {
          mockWhere(...wArgs);
          // First select: communication lookup
          if (currentCall === 1) return [mockCommunication];
          // Second select: org lookup
          if (currentCall === 2) return [mockOrg];
          // For members query, return chain so orderBy can be called
          return chain;
        },
        orderBy: (...oArgs: unknown[]) => {
          mockOrderBy(...oArgs);
          // Third select: members query
          return testMembers;
        },
      };
      return chain;
    },
  },
}));

vi.mock("@/db/schema", () => ({
  communications: {
    id: "communications.id",
    organisationId: "communications.organisationId",
    status: "communications.status",
  },
  communicationRecipients: {
    id: "communicationRecipients.id",
    communicationId: "communicationRecipients.communicationId",
    memberId: "communicationRecipients.memberId",
    channel: "communicationRecipients.channel",
    status: "communicationRecipients.status",
    externalId: "communicationRecipients.externalId",
    error: "communicationRecipients.error",
    sentAt: "communicationRecipients.sentAt",
  },
  organisations: {
    id: "organisations.id",
  },
  members: {
    id: "members.id",
    organisationId: "members.organisationId",
    email: "members.email",
    phone: "members.phone",
    firstName: "members.firstName",
    lastName: "members.lastName",
    membershipClassId: "members.membershipClassId",
    isFinancial: "members.isFinancial",
  },
  organisationMembers: {
    memberId: "organisationMembers.memberId",
    organisationId: "organisationMembers.organisationId",
    role: "organisationMembers.role",
    isActive: "organisationMembers.isActive",
  },
  membershipClasses: {
    id: "membershipClasses.id",
    name: "membershipClasses.name",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
  asc: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi
    .fn()
    .mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  isCommitteeOrAbove: vi.fn().mockReturnValue(true),
}));

const mockSendEmailTracked = vi.fn().mockResolvedValue({ messageId: "email-msg-1" });
const mockSendSMS = vi.fn().mockResolvedValue({ messageId: "sms-msg-1" });
const mockRenderMarkdown = vi.fn().mockReturnValue("<p>Hello <strong>everyone</strong></p>");

vi.mock("@/lib/email/send", () => ({
  sendEmailTracked: (...args: unknown[]) => mockSendEmailTracked(...args),
}));

vi.mock("@/lib/sms/send", () => ({
  sendSMS: (...args: unknown[]) => mockSendSMS(...args),
}));

vi.mock("@/lib/markdown", () => ({
  renderMarkdown: (...args: unknown[]) => mockRenderMarkdown(...args),
}));

vi.mock("@/lib/email/templates/bulk-communication", () => ({
  BulkCommunicationEmail: vi.fn().mockReturnValue(null),
}));

vi.mock("react", () => ({
  default: { createElement: vi.fn().mockReturnValue(null) },
  createElement: vi.fn().mockReturnValue(null),
}));

import { sendCommunication } from "../send";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  updateCallCount = 0;
  mockSendEmailTracked.mockResolvedValue({ messageId: "email-msg-1" });
  mockSendSMS.mockResolvedValue({ messageId: "sms-msg-1" });
});

describe("sendCommunication", () => {
  const baseInput = {
    communicationId: "comm-1",
    organisationId: "org-1",
    slug: "test-org",
  };

  it("rejects unauthorized users", async () => {
    vi.mocked(isCommitteeOrAbove).mockReturnValueOnce(false);

    const result = await sendCommunication(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  it("rejects if user has no session", async () => {
    vi.mocked(getSessionMember).mockResolvedValueOnce(null);

    const result = await sendCommunication(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  it("sends emails to all recipients and updates status", async () => {
    const result = await sendCommunication(baseInput);

    expect(result.success).toBe(true);
    // Should have rendered markdown
    expect(mockRenderMarkdown).toHaveBeenCalledWith("Hello **everyone**");
    // Should have sent 2 emails (one per member with email)
    expect(mockSendEmailTracked).toHaveBeenCalledTimes(2);
    // Should update communication status (SENDING + final)
    expect(mockUpdate).toHaveBeenCalled();
    // Should insert recipient rows
    expect(mockInsert).toHaveBeenCalled();
  });

  it("handles partial failure correctly", async () => {
    // First email succeeds, second fails
    mockSendEmailTracked
      .mockResolvedValueOnce({ messageId: "email-msg-1" })
      .mockResolvedValueOnce({ messageId: null, error: "Delivery failed" });

    const result = await sendCommunication(baseInput);

    expect(result.success).toBe(true);
    // Update should have been called multiple times (status + recipient updates)
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("rejects non-DRAFT communications", async () => {
    // We rely on the counter-based mock: selectCallCount=1 returns communication
    // But we need the communication to have status SENT.
    // Temporarily override mockCommunication.status
    const origStatus = mockCommunication.status;
    mockCommunication.status = "SENT";

    const result = await sendCommunication(baseInput);

    mockCommunication.status = origStatus;

    expect(result.success).toBe(false);
    expect(result.error).toBe("Communication must be in DRAFT status to send");
  });
});
