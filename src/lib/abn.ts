/**
 * Validate an Australian Business Number (ABN).
 * Must contain exactly 11 digits (spaces allowed).
 */
export function validateAbn(abn: string): boolean {
  const digits = abn.replace(/\s/g, "");
  return /^\d{11}$/.test(digits);
}

/**
 * Format an ABN string as "XX XXX XXX XXX".
 */
export function formatAbn(abn: string): string {
  const digits = abn.replace(/\s/g, "");
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
}
