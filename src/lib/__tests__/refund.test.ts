import { describe, it, expect } from "vitest";
import { calculateRefundAmount } from "@/lib/refund";
import type { CancellationRule } from "@/db/schema/cancellation-policies";

describe("calculateRefundAmount", () => {
  const rules: CancellationRule[] = [
    { daysBeforeCheckin: 14, forfeitPercentage: 0 },
    { daysBeforeCheckin: 7, forfeitPercentage: 25 },
    { daysBeforeCheckin: 3, forfeitPercentage: 50 },
  ];

  it("returns full refund when 14+ days before check-in", () => {
    const result = calculateRefundAmount({ rules, totalPaidCents: 84000, daysUntilCheckin: 20 });
    expect(result.refundAmountCents).toBe(84000);
    expect(result.forfeitPercentage).toBe(0);
  });

  it("returns 75% refund when 7-13 days before check-in", () => {
    const result = calculateRefundAmount({ rules, totalPaidCents: 84000, daysUntilCheckin: 10 });
    expect(result.refundAmountCents).toBe(63000);
    expect(result.forfeitPercentage).toBe(25);
  });

  it("returns 50% refund when 3-6 days before check-in", () => {
    const result = calculateRefundAmount({ rules, totalPaidCents: 84000, daysUntilCheckin: 5 });
    expect(result.refundAmountCents).toBe(42000);
    expect(result.forfeitPercentage).toBe(50);
  });

  it("returns no refund when less than 3 days before check-in", () => {
    const result = calculateRefundAmount({ rules, totalPaidCents: 84000, daysUntilCheckin: 1 });
    expect(result.refundAmountCents).toBe(0);
    expect(result.forfeitPercentage).toBe(100);
  });

  it("returns no refund with empty rules", () => {
    const result = calculateRefundAmount({ rules: [], totalPaidCents: 84000, daysUntilCheckin: 30 });
    expect(result.refundAmountCents).toBe(0);
    expect(result.forfeitPercentage).toBe(100);
  });

  it("returns 0 refund when nothing was paid", () => {
    const result = calculateRefundAmount({ rules, totalPaidCents: 0, daysUntilCheckin: 30 });
    expect(result.refundAmountCents).toBe(0);
    expect(result.forfeitPercentage).toBe(0);
  });

  it("handles exact boundary (exactly 14 days)", () => {
    const result = calculateRefundAmount({ rules, totalPaidCents: 84000, daysUntilCheckin: 14 });
    expect(result.refundAmountCents).toBe(84000);
    expect(result.forfeitPercentage).toBe(0);
  });

  it("handles exact boundary (exactly 7 days)", () => {
    const result = calculateRefundAmount({ rules, totalPaidCents: 84000, daysUntilCheckin: 7 });
    expect(result.refundAmountCents).toBe(63000);
    expect(result.forfeitPercentage).toBe(25);
  });

  it("rounds refund down to nearest cent", () => {
    const result = calculateRefundAmount({ rules, totalPaidCents: 10001, daysUntilCheckin: 10 });
    expect(result.refundAmountCents).toBe(7500);
  });
});
