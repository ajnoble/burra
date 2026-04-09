import { getSessionMember, type SessionMember } from "@/lib/auth";

// The shape requireRole operates on. Kept as a structural type so tests
// can construct fixtures without going through getSessionMember.
export type SessionLike = Pick<
  SessionMember,
  "memberId" | "organisationId" | "role" | "firstName" | "lastName" | "email"
>;

export type Role = SessionMember["role"];

export type AuthErrorCode = "UNAUTHORISED" | "FORBIDDEN";

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

const ROLE_ORDER: Record<Role, number> = {
  MEMBER: 0,
  BOOKING_OFFICER: 1,
  COMMITTEE: 2,
  ADMIN: 3,
};

/**
 * Fetch the current session and assert it belongs to `organisationId`.
 * Throws AuthError("UNAUTHORISED") if no user is signed in, or if the
 * signed-in user is not an active member of the organisation. The
 * returned SessionMember is safe to trust for org-scoped work.
 */
export async function requireSession(
  organisationId: string
): Promise<SessionMember> {
  const session = await getSessionMember(organisationId);
  if (!session) {
    throw new AuthError(
      "UNAUTHORISED",
      "You must be signed in to this organisation"
    );
  }
  return session;
}

/**
 * Assert that `session.role` is at or above `minRole`. Role order:
 * MEMBER < BOOKING_OFFICER < COMMITTEE < ADMIN. Throws
 * AuthError("FORBIDDEN") otherwise.
 */
export function requireRole(session: SessionLike, minRole: Role): void {
  if (ROLE_ORDER[session.role] < ROLE_ORDER[minRole]) {
    throw new AuthError(
      "FORBIDDEN",
      `This action requires ${minRole} role or higher`
    );
  }
}

/**
 * If `e` is an AuthError, return the standard server-action error shape.
 * Otherwise return null so the caller can re-throw (unhandled errors
 * should still crash the action).
 */
export function authErrorToResult(
  e: unknown
): { success: false; error: string } | null {
  if (e instanceof AuthError) {
    return { success: false, error: e.message };
  }
  return null;
}
