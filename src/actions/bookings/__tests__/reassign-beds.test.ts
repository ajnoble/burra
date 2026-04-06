import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockSelect = vi.fn();
const mockExecute = vi.fn();

let selectCallCount = 0;

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      const callIndex = selectCallCount++;
      return {
        from: () => ({
          where: () => {
            if (callIndex === 0) return [{ id: "booking-1", lodgeId: "lodge-1", checkInDate: "2027-07-12", checkOutDate: "2027-07-16" }];
            return [];
          },
          innerJoin: () => ({
            where: () => {
              if (callIndex === 1) return [{ id: "bed-2", roomId: "room-2", lodgeId: "lodge-1" }];
              return [];
            },
          }),
        }),
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return { where: () => ({}) };
        },
      };
    },
    execute: (...args: unknown[]) => {
      mockExecute(...args);
      return [];
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
});

import { reassignBeds } from "../reassign-beds";

describe("reassignBeds", () => {
  it("updates bed assignments for booking guests", async () => {
    const result = await reassignBeds({
      bookingId: "booking-1",
      organisationId: "org-1",
      assignments: [{ bookingGuestId: "bg-1", bedId: "bed-2" }],
      slug: "demo",
    });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
