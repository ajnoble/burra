import type { CancellationRule } from "@/db/schema/cancellation-policies";

type RefundInput = {
  rules: CancellationRule[];
  totalPaidCents: number;
  daysUntilCheckin: number;
};

type RefundResult = {
  refundAmountCents: number;
  forfeitPercentage: number;
};

export function calculateRefundAmount(input: RefundInput): RefundResult {
  const { rules, totalPaidCents, daysUntilCheckin } = input;

  if (totalPaidCents === 0) {
    return { refundAmountCents: 0, forfeitPercentage: 0 };
  }

  const sorted = [...rules].sort((a, b) => b.daysBeforeCheckin - a.daysBeforeCheckin);

  for (const rule of sorted) {
    if (daysUntilCheckin >= rule.daysBeforeCheckin) {
      const refundAmountCents = Math.floor(totalPaidCents * (100 - rule.forfeitPercentage) / 100);
      return { refundAmountCents, forfeitPercentage: rule.forfeitPercentage };
    }
  }

  return { refundAmountCents: 0, forfeitPercentage: 100 };
}

export function daysUntilDate(targetDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate + "T00:00:00");
  const diffMs = target.getTime() - today.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
