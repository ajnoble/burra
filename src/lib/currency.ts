/**
 * Format an integer cents value as AUD currency string.
 * All money in the system is stored as integer cents — never use floats.
 */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

/**
 * Calculate percentage of a cents amount using integer arithmetic.
 * basisPoints: 100 = 1%, 500 = 5%, 1000 = 10%
 */
export function applyBasisPoints(cents: number, basisPoints: number): number {
  return Math.round((cents * basisPoints) / 10000);
}

/**
 * Extract the GST component from a GST-inclusive amount.
 * Formula: amountCents * gstRateBps / (10000 + gstRateBps)
 * For 10% GST (1000 bps): amountCents * 1000 / 11000
 */
export function calculateGst(amountCents: number, gstRateBps: number): number {
  if (gstRateBps === 0) return 0;
  return Math.round((amountCents * gstRateBps) / (10000 + gstRateBps));
}
