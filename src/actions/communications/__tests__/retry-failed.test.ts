import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockInnerJoin = vi.fn();

const mockFailedRecipients = [
  {
    communication_recipients: {
      id: "cr-1",
      communicationId: "comm-1",
      memberId: "m1",
      channel: "EMAIL" as const,
      status: "FAILED",
      error: "Delivery failed",
    },
    members: {
      id: "m1",
      email: "alice@example.com",
      phone: "0400000001",
    },
  },
  {
    communication_recipients: {
      id: "cr-2",
      communicationId: "comm-1",
      memberId: "m2",
      channel: "SMS" as const,
      status: "FAILED",
      error: "Number invalid",
    },
    members: {
      id: "m2",
      email: "bob@example.com",
      phone: "0400000002",
    },
  },
];

const mockCommunication = {
  id: "comm-1",
  organisationId: "org-1",
  subject: "Test Subject",
  bodyMarkdown: "Hello **world**",
  smsBody: null,
  channel: "EMAIL",
  status: "PARTIAL_FAILURE",
  filters: {},
};

const mockOrg = {
  id: "org-1",
  name: "Test Org",
  contactEmail: "contact@test.org",
  logoUrl: "https://test.org/logo.png",
  smsFromNumber: "+61400000000",
};

let selectCallCount = 0;

vi.mock("@/db/index", () => ({
  db: {
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
        where: (...wArgs: unknown[]) => {
          mockWhere(...wArgs);
          // 1st: communication lookup, 2nd: org lookup, 3rd: failed recipients
          if (currentCall === 1) return [mockCommunication];
          if (currentCall === 2) return [mockOrg];
          // 3rd call returns the failed recipients array directly
          return mockFailedRecipients;
        },
      };
      return chain;
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return { returning: () => [] };
            },
          };
        },
      };
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
    email: "members.email",
    phone: "members.phone",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
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

const mockSendEmailTracked = vi.fn().mockResolvedValue({ messageId: "retry-email-1" });
const mockSendSMS = vi.fn().mockResolvedValue({ messageId: "retry-sms-1" });
const mockRenderMarkdown = vi.fn().mockReturnValue("<p>Hello <strong>world</strong></p>");

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

import { retryFailed } from "../retry-failed";
import { isCommitteeOrAbove } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  mockSendEmailTracked.mockResolvedValue({ messageId: "retry-email-1" });
  mockSendSMS.mockResolvedValue({ messageId: "retry-sms-1" });
});

describe("retryFailed", () => {
  const baseInput = {
    communicationId: "comm-1",
    organisationId: "org-1",
    slug: "test-org",
  };

  it("rejects unauthorized users", async () => {
    vi.mocked(isCommitteeOrAbove).mockReturnValueOnce(false);

    const result = await retryFailed(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  it("retries failed recipients and returns count", async () => {
    const result = await retryFailed(baseInput);

    expect(result.success).toBe(true);
    expect(result.retried).toBe(2);
    // Should have sent 1 email + 1 SMS
    expect(mockSendEmailTracked).toHaveBeenCalledTimes(1);
    expect(mockSendSMS).toHaveBeenCalledTimes(1);
  });

  it("updates recipient status on retry", async () => {
    await retryFailed(baseInput);

    // Should update recipient rows
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalled();
  });
});
