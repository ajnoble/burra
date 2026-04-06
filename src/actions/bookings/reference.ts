// Characters excluding ambiguous ones: O, 0, I, 1, L
const SAFE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function getOrgPrefix(slug: string): string {
  const stripped = slug.replace(/-/g, "");
  return stripped.slice(0, 4).toUpperCase();
}

function randomAlphanumeric(length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)];
  }
  return result;
}

export function generateBookingReference(orgSlug: string): string {
  const prefix = getOrgPrefix(orgSlug);
  const year = new Date().getFullYear();
  const random = randomAlphanumeric(4);
  return `${prefix}-${year}-${random}`;
}
