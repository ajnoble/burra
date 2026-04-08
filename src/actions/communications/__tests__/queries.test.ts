import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLeftJoin = vi.fn();
const mockLimit = vi.fn();
const mockOffset = vi.fn();
const mockGroupBy = vi.fn();

const mockCommunication = {
  id: "comm-1",
  organisationId: "org-1",
  subject: "Test Subject",
  bodyMarkdown: "Hello **world**",
  smsBody: null,
  channel: "EMAIL",
  status: "SENT",
  filters: {},
  recipientCount: 10,
  createdByMemberId: "admin-1",
  sentAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCommunicationsList = [
  { ...mockCommunication },
  { ...mockCommunication, id: "comm-2", subject: "Second" },
];

let selectCallCount = 0;

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      selectCallCount++;
      const chain: Record<string, (...a: unknown[]) => unknown> & { [Symbol.iterator]?: () => Iterator<unknown> } = {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return chain;
        },
        leftJoin: (...jArgs: unknown[]) => {
          mockLeftJoin(...jArgs);
          return chain;
        },
        where: (...wArgs: unknown[]) => {
          const override = mockWhere(...wArgs);
          if (Array.isArray(override)) return override;
          return chain;
        },
        orderBy: (...oArgs: unknown[]) => {
          mockOrderBy(...oArgs);
          return chain;
        },
        limit: (...lArgs: unknown[]) => {
          mockLimit(...lArgs);
          return chain;
        },
        offset: (...oArgs: unknown[]) => {
          mockOffset(...oArgs);
          return mockCommunicationsList;
        },
        groupBy: (...gArgs: unknown[]) => {
          mockGroupBy(...gArgs);
          return [
            { status: "SENT", count: 8 },
            { status: "FAILED", count: 2 },
          ];
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
    createdAt: "communications.createdAt",
    createdByMemberId: "communications.createdByMemberId",
  },
  communicationRecipients: {
    id: "communicationRecipients.id",
    communicationId: "communicationRecipients.communicationId",
    memberId: "communicationRecipients.memberId",
    channel: "communicationRecipients.channel",
    status: "communicationRecipients.status",
  },
  members: {
    id: "members.id",
    firstName: "members.firstName",
    lastName: "members.lastName",
    email: "members.email",
    phone: "members.phone",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  count: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi
    .fn()
    .mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  isCommitteeOrAbove: vi.fn().mockReturnValue(true),
}));

import {
  listCommunications,
  getCommunication,
  getRecipientStats,
  getRecipients,
} from "../queries";

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
});

describe("listCommunications", () => {
  it("returns paginated communications list", async () => {
    const result = await listCommunications("org-1");

    expect(result.success).toBe(true);
    expect(result.communications).toHaveLength(2);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(25);
    expect(mockOffset).toHaveBeenCalled();
  });

  it("supports page parameter", async () => {
    await listCommunications("org-1", { page: 2 });

    expect(mockOffset).toHaveBeenCalledWith(25);
  });
});

describe("getCommunication", () => {
  it("returns a single communication", async () => {
    // Override where to return single item
    mockWhere.mockReturnValueOnce([mockCommunication]);

    const result = await getCommunication("comm-1", "org-1");

    expect(result).toEqual(mockCommunication);
    expect(mockSelect).toHaveBeenCalled();
  });

  it("returns null when not found", async () => {
    mockWhere.mockReturnValueOnce([]);

    const result = await getCommunication("not-found", "org-1");

    expect(result).toBeNull();
  });
});

describe("getRecipientStats", () => {
  it("returns grouped status counts", async () => {
    const result = await getRecipientStats("comm-1");

    expect(result).toBeDefined();
    expect(mockSelect).toHaveBeenCalled();
    expect(mockGroupBy).toHaveBeenCalled();
  });
});

describe("getRecipients", () => {
  it("returns paginated recipients", async () => {
    const result = await getRecipients("comm-1");

    expect(result.success).toBe(true);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(25);
  });
});
