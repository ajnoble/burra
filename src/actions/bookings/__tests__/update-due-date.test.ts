import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockUpdateWhere = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockUpdateWhere(...wArgs);
              return Promise.resolve();
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  bookings: { id: "id", organisationId: "organisationId" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "m1", role: "ADMIN" }),
  canAccessAdmin: vi.fn().mockReturnValue(true),
}));

import { updateBookingDueDate } from "../update-due-date";

describe("updateBookingDueDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the balance due date", async () => {
    const result = await updateBookingDueDate({
      bookingId: "b1",
      organisationId: "org1",
      balanceDueDate: "2027-07-15",
      slug: "alpine",
    });

    expect(result).toEqual({ success: true });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        balanceDueDate: "2027-07-15",
        updatedAt: expect.any(Date),
      })
    );
  });

  it("clears the balance due date when null", async () => {
    const result = await updateBookingDueDate({
      bookingId: "b1",
      organisationId: "org1",
      balanceDueDate: null,
      slug: "alpine",
    });

    expect(result).toEqual({ success: true });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ balanceDueDate: null })
    );
  });
});
