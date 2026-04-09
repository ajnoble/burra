<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Testing

Read `docs/testing.md` before writing any test. It distinguishes unit /
integration / E2E tests, lists the banned mock-theatre antipatterns by name,
and documents the pglite integration harness. Violations block PR review.

Commands:
- `npm test` — unit tests (fast, no DB)
- `npm run test:integration` — integration tests (pglite, slower)
- `npm run test:e2e` — Playwright E2E

# Authentication

Every org-scoped server action must call `requireSession(organisationId)`
from `@/lib/auth-guards` at entry. Most must also call
`requireRole(session, minRole)`. Read `docs/auth.md` before writing or
modifying any server action.
