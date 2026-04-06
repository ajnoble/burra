import { describe, it, expect } from "vitest";
import { getSubscriptionSummary } from "../queries";

describe("getSubscriptionSummary", () => {
  it("returns zeros for empty list", () => {
    const result = getSubscriptionSummary([]);
    expect(result).toEqual({
      totalExpected: 0,
      totalCollected: 0,
      totalOutstanding: 0,
      totalWaived: 0,
    });
  });

  it("computes totals correctly for mixed statuses", () => {
    const subs = [
      { status: "PAID", amountCents: 15000 },
      { status: "PAID", amountCents: 20000 },
      { status: "UNPAID", amountCents: 10000 },
      { status: "WAIVED", amountCents: 5000 },
    ];
    const result = getSubscriptionSummary(subs);
    expect(result).toEqual({
      totalExpected: 50000,
      totalCollected: 35000,
      totalOutstanding: 10000,
      totalWaived: 5000,
    });
  });

  it("handles all PAID subscriptions", () => {
    const subs = [
      { status: "PAID", amountCents: 10000 },
      { status: "PAID", amountCents: 10000 },
    ];
    const result = getSubscriptionSummary(subs);
    expect(result).toEqual({
      totalExpected: 20000,
      totalCollected: 20000,
      totalOutstanding: 0,
      totalWaived: 0,
    });
  });

  it("handles all UNPAID subscriptions", () => {
    const subs = [
      { status: "UNPAID", amountCents: 10000 },
      { status: "UNPAID", amountCents: 5000 },
    ];
    const result = getSubscriptionSummary(subs);
    expect(result).toEqual({
      totalExpected: 15000,
      totalCollected: 0,
      totalOutstanding: 15000,
      totalWaived: 0,
    });
  });

  it("handles all WAIVED subscriptions", () => {
    const subs = [
      { status: "WAIVED", amountCents: 8000 },
    ];
    const result = getSubscriptionSummary(subs);
    expect(result).toEqual({
      totalExpected: 8000,
      totalCollected: 0,
      totalOutstanding: 0,
      totalWaived: 8000,
    });
  });
});
