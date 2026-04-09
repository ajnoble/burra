# Phase 20 — Custom Member Fields

## Overview

Admin-defined custom fields per organisation, rendered on member profile forms and included in CSV export/import. Admin-only for viewing and editing. Soft "required" indicator (no hard enforcement).

## Data Model

### `custom_fields` — field definitions per org

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `organisation_id` | uuid | FK → organisations |
| `name` | text | Display label (e.g. "Emergency Contact") |
| `key` | text | Snake_case identifier, used as CSV header (e.g. "emergency_contact") |
| `type` | enum | `text`, `number`, `date`, `dropdown`, `checkbox` |
| `options` | text | Nullable. Comma-separated values for dropdown type |
| `sort_order` | integer | Display ordering |
| `is_required` | boolean | Soft indicator only — shows asterisk, does not block save |
| `is_active` | boolean | Deactivated fields hidden from forms, data preserved |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique constraint: `(organisation_id, key)` — prevents duplicate keys within an org.

### `custom_field_values` — values per member

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `custom_field_id` | uuid | FK → custom_fields |
| `member_id` | uuid | FK → members |
| `value` | text | All types stored as text, parsed/validated by field type |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Unique constraint: `(custom_field_id, member_id)` — one value per field per member.

### Type storage conventions

- **text**: stored as-is
- **number**: stored as string representation of number (e.g. "42", "3.5")
- **date**: stored as ISO date string (e.g. "2026-01-15")
- **dropdown**: stored as the selected option string (must match one of the comma-separated options)
- **checkbox**: stored as "true" or "false"

## Admin UI: Field Management

Located on `/{slug}/admin/settings` as a new "Custom Fields" section below the existing membership class manager.

Follows the same pattern as `membership-class-manager.tsx`:
- List of defined fields showing name, type, required badge, sort order
- "Add Field" button opens inline form:
  - Name (text input)
  - Key (auto-generated from name, editable)
  - Type (select: text/number/date/dropdown/checkbox)
  - Options (text input, shown only when type is dropdown — comma-separated)
  - Required toggle
- Edit and delete actions per field
- Reorder via sort order (up/down buttons)
- Deactivating a field hides it from forms but preserves existing data

## Admin UI: Member Profile Form

Custom fields render below existing fields in `member-profile-form.tsx` in a "Custom Fields" section:
- **text** → `<Input>`
- **number** → `<Input type="number">`
- **date** → `<Input type="date">`
- **dropdown** → `<select>` with options parsed from comma-separated string
- **checkbox** → checkbox input
- Required fields show asterisk label (soft — form still submits without value)

Fields ordered by `sort_order`. Only active fields shown.

## Member Detail Page

Custom field values displayed in read-only format on `/{slug}/admin/members/[memberId]` alongside existing member data. Empty fields show "—".

## CSV Export

Member-related report exports append custom field columns after standard columns. Column headers use the field `key`. Only active fields included. Checkbox values exported as "Yes"/"No".

## CSV Import

Existing import flow in `src/lib/import/parse-csv.ts` extended:
- Custom field columns matched by header name (case-insensitive, spaces→underscores) against org's defined field keys
- Columns matching custom fields are no longer flagged as "unknown"
- Values validated by type:
  - **number**: must parse as finite number
  - **date**: must be valid date string
  - **dropdown**: must match one of the defined options (case-insensitive)
  - **checkbox**: accepts "true"/"false"/"yes"/"no"/"1"/"0"
  - **text**: any value accepted
- Invalid custom field values generate row-level warnings but do not block import
- Valid values saved to `custom_field_values` after member creation

## Server Actions

### `src/actions/custom-fields/manage.ts`
- `createCustomField({ organisationId, name, key, type, options, isRequired })` → creates field definition
- `updateCustomField({ fieldId, organisationId, ... })` → updates field definition
- `reorderCustomFields({ organisationId, fieldIds })` → updates sort_order
- `deleteCustomField({ fieldId, organisationId })` → soft-delete (sets is_active=false)
- `getCustomFields({ organisationId })` → returns active fields ordered by sort_order

### `src/actions/custom-fields/values.ts`
- `saveCustomFieldValues({ memberId, organisationId, values: { fieldId: value }[] })` → upsert values
- `getCustomFieldValues({ memberId, organisationId })` → returns values joined with field definitions

### Updates to existing actions
- `src/actions/members/update.ts` — accepts optional `customFields` parameter, calls `saveCustomFieldValues`
- `src/actions/members/import.ts` — after member creation, saves custom field values from CSV columns
- `src/lib/import/parse-csv.ts` — accepts optional custom field keys, validates matching columns

## Audit Logging

Custom field value changes logged via existing audit log system:
- Action: `MEMBER_UPDATED` (same as existing member field changes)
- `previousValue` / `newValue` include custom field diffs

## File Structure

```
src/
  db/schema/
    custom-fields.ts              # custom_fields + custom_field_values tables
  actions/custom-fields/
    manage.ts + manage.test.ts    # CRUD for field definitions
    values.ts + values.test.ts    # Save/fetch field values
  app/[slug]/admin/settings/
    custom-field-manager.tsx       # Field management UI component
  app/[slug]/admin/members/[memberId]/
    custom-fields-section.tsx      # Read-only display on member detail
    member-profile-form.tsx        # Updated — renders custom field inputs
```

## Testing

### Unit/Integration (~6-8 test files, ~30-40 tests)
- Custom field CRUD: create, update, reorder, deactivate
- Value save/fetch: all 5 types, upsert behaviour
- Validation: type-specific validation for each field type
- CSV import with custom fields: matching, validation, value persistence
- CSV export with custom fields: correct headers and values
- Edge cases: deactivated field values preserved, unknown dropdown option rejected

### E2E (~1 spec file, ~6-8 tests)
- Admin creates custom field (each type)
- Admin sets values on member profile
- Values appear on member detail page
- CSV export includes custom field columns
- Field management: edit, reorder, deactivate
