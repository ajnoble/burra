import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return { returning: () => [{ id: "org-1" }] };
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  organisations: {
    id: "organisations.id",
    smsPreArrivalEnabled: "organisations.smsPreArrivalEnabled",
    smsPreArrivalHours: "organisations.smsPreArrivalHours",
    smsPaymentReminderEnabled: "organisations.smsPaymentReminderEnabled",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi
    .fn()
    .mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  isAdmin: vi.fn().mockReturnValue(true),
}));

import { updateSmsSettings } from "../settings";
import { getSessionMember, isAdmin } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateSmsSettings", () => {
  const baseInput = {
    organisationId: "org-1",
    smsPreArrivalEnabled: true,
    smsPreArrivalHours: 12,
    smsPaymentReminderEnabled: false,
    slug: "test-org",
  };

  it("updates SMS settings successfully", async () => {
    const result = await updateSmsSettings(baseInput);

    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        smsPreArrivalEnabled: true,
        smsPreArrivalHours: 12,
        smsPaymentReminderEnabled: false,
      })
    );
  });

  it("rejects non-admin users", async () => {
    vi.mocked(isAdmin).mockReturnValueOnce(false);

    const result = await updateSmsSettings(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unauthorized - admin only");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects if no session", async () => {
    vi.mocked(getSessionMember).mockResolvedValueOnce(null);

    const result = await updateSmsSettings(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unauthorized - admin only");
  });
});
