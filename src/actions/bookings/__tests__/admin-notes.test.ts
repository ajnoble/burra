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
              return { returning: () => [{ id: "booking-1" }] };
            },
          };
        },
      };
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); });

import { updateAdminNotes } from "../admin-notes";

describe("updateAdminNotes", () => {
  it("updates admin notes on the booking", async () => {
    const result = await updateAdminNotes({
      bookingId: "booking-1",
      organisationId: "org-1",
      notes: "VIP guest — give best room",
      slug: "demo",
    });
    expect(result.success).toBe(true);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ adminNotes: "VIP guest — give best room" })
    );
  });
});
