# Authentication & Authorisation

Every org-scoped server action must call `requireSession(organisationId)`
before reading or writing any data. Most must also call
`requireRole(session, minRole)` to enforce privilege level.

## The guards

From `src/lib/auth-guards.ts`:

- `requireSession(organisationId)` — throws `AuthError("UNAUTHORISED")` if
  the current user is not signed in OR is not an active member of the
  target organisation. Pins cross-tenant mass-assignment: if the caller
  passes a foreign `organisationId` in the input, the membership lookup
  fails and the request is rejected.
- `requireRole(session, minRole)` — throws `AuthError("FORBIDDEN")` if
  the session role is below the required threshold. Role order is
  `MEMBER < BOOKING_OFFICER < COMMITTEE < ADMIN`.
- `AuthError` — thrown by both guards. Has `.code` field which is either
  `"UNAUTHORISED"` or `"FORBIDDEN"`.
- `authErrorToResult(e)` — if `e` is an `AuthError`, returns the standard
  server-action `{ success: false, error }` shape. Otherwise returns
  `null` so the caller can re-throw.

## The pattern

Every org-scoped server action follows this shape:

```ts
import {
  requireSession,
  requireRole,
  authErrorToResult,
} from "@/lib/auth-guards";

export async function myAction(input: MyInput): Promise<MyResult> {
  try {
    const session = await requireSession(input.organisationId);
    requireRole(session, "BOOKING_OFFICER");

    // ... existing action body. Use session.memberId and
    // session.organisationId instead of trusting input values where
    // possible.
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult as MyResult;
    throw e;
  }
}
```

The `as MyResult` cast is accepted because every server-action result
type must include the `{ success: false, error: string }` shape for
error handling anyway.

## Choosing minRole

| Role             | What they can do                                      |
|------------------|-------------------------------------------------------|
| `MEMBER`         | Book, cancel own booking, edit own profile            |
| `BOOKING_OFFICER`| All booking writes: cancel any, reassign beds, admin notes |
| `COMMITTEE`      | Reports, bulk comms, waitlist admin                   |
| `ADMIN`          | Organisation settings, lodges, members, subscription  |

When in doubt, pick the **higher** role. Downgrading is easy later;
upgrading after a bug is found is painful.

## When `requireSession` alone is sufficient

Member-facing actions (e.g. `memberEditBooking`, `memberCancelOwnBooking`)
call `requireSession` to establish the caller, then do additional
ownership checks (`booking.primaryMemberId === session.memberId`).
Don't use `requireRole` for these — a regular member's role doesn't
grant booking admin privileges, it's their ownership of the row.

## Testing

Every fix to this pattern gets an integration test that proves:
1. Cross-tenant attempt is rejected (the mass-assignment attack).
2. Same-org member without the required role is rejected (the role
   gap).
3. Same-org user with the required role succeeds.

See `src/lib/__tests__/auth-guards.integration.test.ts` for the
foundational test and `src/actions/bookings/__tests__/cancel.integration.test.ts`
for the action-level pattern.

## What NOT to do

- **Do not** check `session?.role === "ADMIN"` yourself. Use `requireRole`.
- **Do not** accept `organisationId` from input without calling
  `requireSession(input.organisationId)` first.
- **Do not** call `getSessionMember` directly in a server action.
  Always use `requireSession` so the throw path is consistent.
- **Do not** swallow `AuthError` with a generic catch. Use
  `authErrorToResult` to convert and re-throw unknown errors.
