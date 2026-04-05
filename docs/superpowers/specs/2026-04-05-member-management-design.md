# Phase 4: Member Management — Design Spec

## Overview

Admin UI and server actions for managing club members: listing, searching, filtering, creating, editing, family linking, role management, and financial status tracking with history.

## Schema Addition

One new table in `src/db/schema/members.ts`:

```
financialStatusChanges
  id                uuid PK (defaultRandom)
  organisationId    uuid FK → organisations (notNull)
  memberId          uuid FK → members (notNull)
  isFinancial       boolean (notNull)
  reason            text (notNull)
  changedByMemberId uuid FK → members (notNull)
  createdAt         timestamp with timezone (defaultNow, notNull)
```

Export from `src/db/schema/index.ts`. Generate migration via `npm run db:generate`.

No changes to existing tables. `members.isFinancial` remains the source of truth for current status. The new table is append-only history.

## Pages

### 1. Member List — `/[slug]/admin/members/page.tsx`

**Layout:**
- Header: "Members" title, member count badge, "Add Member" button (links to `/admin/members/new`)
- Filter bar:
  - Text search input (searches firstName, lastName, email via `ilike`)
  - Membership class dropdown
  - Role dropdown (MEMBER, BOOKING_OFFICER, COMMITTEE, ADMIN)
  - Financial status filter (All / Financial / Unfinancial)
  - Family group filter (All / Has Family / No Family)
  - Join date range (from/to date inputs)
- Table columns: Name, Email, Membership Class, Role, Financial Status, Family Group, Joined
- Server-side pagination, 25 per page
- Row click navigates to `/admin/members/[memberId]`

**Data fetching:** Server component reading searchParams. Drizzle query joining members → organisationMembers → membershipClasses.

### 2. Member Detail — `/[slug]/admin/members/[memberId]/page.tsx`

Three vertically stacked sections:

**Profile section:**
- Editable form: firstName, lastName, email, phone, dateOfBirth, memberNumber, membershipClass (dropdown), notes (textarea)
- "Save Changes" button → `updateMember()` server action

**Family section:**
- If member has `primaryMemberId`: shows "Primary Member: [name]" with "Unlink" button
- If member IS a primary: lists dependents with "Unlink" button on each
- "Link Family Member" button → dialog with member search (text input, results list), selecting sets `primaryMemberId` on the target member
- Server actions: `linkFamilyMember()`, `unlinkFamilyMember()`

**Role & Financial section:**
- Role: current role displayed, dropdown to change → `updateMemberRole()` server action
- Financial status: current status displayed, "Change Status" button opens inline form with:
  - New status (toggle)
  - Reason (required text field)
  - Submit → `updateFinancialStatus()` server action
- Financial history table below: Date, Status, Reason, Changed By

### 3. Add Member — `/[slug]/admin/members/new/page.tsx`

- Form: firstName, lastName, email, phone (optional), dateOfBirth (optional), memberNumber (optional), membershipClass (dropdown), notes (optional), role (dropdown, default MEMBER), isFinancial (toggle, default true)
- "Create Member" button → `createMember()` server action
- On success: redirect to new member's detail page
- Email must be unique within the organisation

## Server Actions (`src/actions/members/`)

| Action | File | Description |
|--------|------|-------------|
| `createMember` | `create.ts` | Validate input, insert `members` + `organisationMembers` in transaction, redirect to detail page |
| `updateMember` | `update.ts` | Validate input, update profile fields on `members` table |
| `updateMemberRole` | `role.ts` | Update `role` on `organisationMembers`. Requires ADMIN or COMMITTEE role. |
| `updateFinancialStatus` | `financial.ts` | Update `members.isFinancial`, insert row into `financialStatusChanges`. Requires BOOKING_OFFICER+ role. |
| `linkFamilyMember` | `family.ts` | Set `primaryMemberId` on dependent member. Validates both members belong to same org. Cannot self-link. Cannot link if target already has a primary. A primary member cannot themselves be a dependent (no chains). |
| `unlinkFamilyMember` | `family.ts` | Clear `primaryMemberId` on dependent member. |

All actions:
- Enforce org scoping (organisationId checked against session)
- Validate with Zod schemas
- Return `{ success, error? }` pattern
- Use `revalidatePath` after mutation

## Query Helpers (`src/lib/members.ts`)

| Function | Description |
|----------|-------------|
| `getMembers(orgId, filters)` | Paginated, filtered list with joins to organisationMembers and membershipClasses |
| `getMemberById(orgId, memberId)` | Full member with role, membership class name, primary member info |
| `getFamilyMembers(orgId, primaryMemberId)` | All dependents linked to a primary member |
| `getFinancialHistory(orgId, memberId)` | All financial status changes, ordered by createdAt desc, with changer name |
| `searchMembers(orgId, query)` | Lightweight name/email search for family linking dialog, returns id + name + email |

## Validation Schemas (`src/lib/validation.ts`)

- `createMemberSchema` — firstName, lastName, email (valid format), membershipClassId (uuid), optional: phone, dateOfBirth, memberNumber, notes, role, isFinancial
- `updateMemberSchema` — same fields as create, all optional except organisationId and memberId
- `financialStatusChangeSchema` — isFinancial (boolean), reason (string, min 1 char)

## Access Control

| Action | Minimum Role |
|--------|-------------|
| View member list / detail | BOOKING_OFFICER |
| Create member | BOOKING_OFFICER |
| Edit member profile | BOOKING_OFFICER |
| Change role | COMMITTEE |
| Change financial status | BOOKING_OFFICER |
| Link/unlink family | BOOKING_OFFICER |

Already enforced by the admin layout (redirects non-admin roles). Role-change actions add an additional check for COMMITTEE+.

## UI Components

Reuse existing shadcn/ui components: Table, Input, Select, Button, Dialog, Badge, Card, Label, Separator, Tabs.

No new shared components needed. Page-specific components:
- `member-filters.tsx` — filter bar (client component for interactivity)
- `member-table.tsx` — table with pagination
- `member-form.tsx` — shared form for create/edit
- `family-link-dialog.tsx` — search and link dialog
- `financial-status-form.tsx` — status change with reason
- `financial-history-table.tsx` — history display

## Testing Strategy (TDD)

Tests written before implementation for each layer:

1. **Validation schemas** — test all schema rules, edge cases
2. **Query helpers** — test with mocked db (verify correct query construction)
3. **Server actions** — test validation, auth checks, error paths
4. **Components** — test filter interactions, form submission, display logic
