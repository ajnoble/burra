# Phase 18 — Audit Log Viewer Design

## Overview

Build a comprehensive audit logging system with full instrumentation across all major actions and a filterable viewer UI. The `audit_log` table schema already exists — this phase instruments the codebase to write to it and builds the admin viewer.

## Design Decisions

- **Instrumentation scope:** Full — all major actions across bookings, members, subscriptions, charges, documents, communications, waitlist, settings
- **Change tracking:** Changed fields only (not full entity snapshots). `previousValue` is `null` for creates, `newValue` is `null` for deletes.
- **Viewer features:** Expandable row diffs + clickable entity links
- **Export:** CSV export matching existing reports pattern
- **Architecture:** Centralized `createAuditLog()` helper with manual calls in each server action

---

## Audit Log Helper

### `src/lib/audit-log.ts`

Single `createAuditLog()` function that inserts into the `audit_log` table. Fire-and-forget — audit log failures never break the operation being audited.

```ts
createAuditLog({
  organisationId,
  actorMemberId: session.memberId,
  action: "MEMBER_ROLE_CHANGED",
  entityType: "member",
  entityId: memberId,
  previousValue: { role: "MEMBER" },
  newValue: { role: "ADMIN" },
}).catch(console.error);
```

### `diffChanges` Utility

```ts
function diffChanges(
  previous: Record<string, unknown>,
  current: Record<string, unknown>
): { previousValue: Record<string, unknown>; newValue: Record<string, unknown> }
```

Compares two objects, returns only the keys that differ. Used at each instrumentation site to compute the changed fields. For create actions, `previousValue` is `null`. For delete actions, `newValue` is `null`.

---

## Actions to Instrument

| Entity | Actions | Key Fields Tracked |
|---|---|---|
| **Booking** | CREATED, APPROVED, REJECTED, CANCELLED | status, dates, lodge, guests |
| **Member** | ROLE_CHANGED, FINANCIAL_STATUS_CHANGED, UPDATED, DELETED | role, financialStatus, name, email |
| **Subscription** | CREATED, PAID, WAIVED, CANCELLED | status, amount, season |
| **Charge** | CREATED, PAID, CANCELLED | amount, description, status |
| **Document** | UPLOADED, UPDATED, DELETED | title, accessLevel, category |
| **Communication** | SENT | channel, subject, recipientCount |
| **Waitlist** | JOINED, NOTIFIED, CONVERTED, EXPIRED | status, lodge, dates |
| **Settings** | UPDATED | changed setting fields |
| **Category** | CREATED, DELETED | name |

Each instrumentation is a single `createAuditLog()` call added after the successful DB operation in the existing server action. The call is fire-and-forget (`.catch(console.error)`).

---

## Audit Log Viewer UI

### Page: `/{slug}/admin/audit-log`

Access: ADMIN and COMMITTEE roles. Follows existing admin page pattern.

### Filters

| Filter | Type | Options |
|---|---|---|
| Action | Select dropdown | All actions from the enum |
| Entity Type | Select dropdown | booking, member, subscription, charge, document, communication, waitlist, settings |
| Actor | Select dropdown | List of org members |
| Date From | Date input | |
| Date To | Date input | |
| Search | Text input | Searches entity ID or action |

### Table Columns

| Column | Content |
|---|---|
| Date | Formatted timestamp |
| Actor | Member name (joined from `actorMemberId`) |
| Action | Badge with action name (e.g., `BOOKING_APPROVED`) |
| Entity | Type + link to entity page |
| Changes | Summary text (e.g., "role: MEMBER -> ADMIN") |

### Row Expansion

Clicking a row expands to show:
- Full change diff: field-by-field before/after values
- "View [entity type]" link button navigating to the entity's admin page

### Pagination

Server-side, 25 rows per page, matching the reports pattern.

### CSV Export

"Export CSV" button in header, reuses the existing `export-csv.ts` serialiser. Columns: Date, Actor, Action, Entity Type, Entity ID, Changes.

### Change Summary Display

A `formatChangeSummary()` function that turns the JSONB diff into a readable string:
- `role: MEMBER -> ADMIN`
- `status: pending -> approved`
- `Created booking`
- `Deleted document "Bylaws 2025"`

Used in both the table column and CSV export.

### Entity URL Resolver

```ts
function getEntityUrl(slug: string, entityType: string, entityId: string): string | null
```

Returns the admin URL for the entity, or `null` if no detail page exists (falls back to list page). Simple switch statement.

### Responsive Behaviour

- Filters stack vertically on mobile
- Table scrolls horizontally on small screens
- Row expansion works as full-width panel below the row
- Export button remains accessible in header

---

## File Structure

### New Files

```
src/
  lib/
    audit-log.ts              — createAuditLog helper + diffChanges util
    audit-log.test.ts         — helper + diff logic tests
  actions/
    audit-log/
      queries.ts              — getAuditLogEntries (filtered, paginated)
      queries.test.ts
      export-csv.ts           — CSV export for audit log
      export-csv.test.ts
  app/[slug]/admin/
    audit-log/
      page.tsx                — server component, fetches data
      audit-log-filters.tsx   — client component, filter controls
      audit-log-table.tsx     — client component, table + row expansion
      audit-log-export.tsx    — client component, export button
```

### Modified Files (Instrumentation)

Each gets a `createAuditLog()` call added after the successful operation:

```
src/actions/bookings/create.ts
src/actions/bookings/approve.ts
src/actions/bookings/reject.ts
src/actions/bookings/cancel.ts
src/actions/members/update-role.ts
src/actions/members/update-financial-status.ts
src/actions/members/update.ts
src/actions/members/delete.ts
src/actions/subscriptions/create.ts
src/actions/subscriptions/pay.ts
src/actions/subscriptions/waive.ts
src/actions/subscriptions/cancel.ts
src/actions/charges/create.ts
src/actions/charges/pay.ts
src/actions/charges/cancel.ts
src/actions/documents/upload.ts
src/actions/documents/update.ts
src/actions/documents/delete.ts
src/actions/communications/send.ts
src/actions/waitlist/join.ts
src/actions/waitlist/notify.ts
src/actions/waitlist/convert.ts
src/actions/settings/update.ts
src/actions/documents/categories.ts
```

---

## Testing Plan

### Unit/Integration (~8 test files, ~30-40 tests)

- `audit-log.test.ts` — createAuditLog inserts correctly, diffChanges computes field diffs, fire-and-forget doesn't throw
- `queries.test.ts` — filtering by action/entity/actor/date, pagination, empty results
- `export-csv.test.ts` — correct headers, date formatting, change summary serialisation
- Spot-check 2-3 instrumented actions to verify audit log is called with correct params

### E2E (1 spec file, ~6 tests)

`e2e/tests/admin-audit-log.spec.ts`:
- Page loads with heading and filters
- Filter by entity type narrows results
- Filter by date range narrows results
- Row expansion shows change diff
- Entity link navigates correctly
- CSV export triggers download
