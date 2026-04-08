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
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  waitlistEntries: {
    status: "waitlistEntries.status",
    expiresAt: "waitlistEntries.expiresAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  lt: vi.fn(),
}));

import { expireWaitlistEntries } from "../expire";
import { waitlistEntries } from "@/db/schema";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("expireWaitlistEntries", () => {
  it("updates NOTIFIED entries past expiresAt to EXPIRED and returns success", async () => {
    const result = await expireWaitlistEntries();

    expect(mockUpdate).toHaveBeenCalledWith(waitlistEntries);
    expect(mockSet).toHaveBeenCalledWith({ status: "EXPIRED" });
    expect(mockWhere).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });
});
