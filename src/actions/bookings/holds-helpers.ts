/**
 * Check if a hold has expired.
 */
export function isHoldExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}

/**
 * Calculate the expiration timestamp from now + minutes.
 */
export function calculateExpiresAt(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}
