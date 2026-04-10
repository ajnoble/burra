# Associates Booking & Port-a-Cot Support

## Overview

Members can book on behalf of non-member associates (external guests). Associates
are saved to the member's profile for reuse across future bookings. Rooms support
port-a-cots as a lodge-level bookable resource with tariff-based pricing.

## Data Model

### New table: `associates`

| Column          | Type      | Notes                                    |
|-----------------|-----------|------------------------------------------|
| id              | uuid      | PK, default random                       |
| organisationId  | uuid      | FK to organisations, not null            |
| ownerMemberId   | uuid      | FK to members, not null                  |
| firstName       | text      | not null                                 |
| lastName        | text      | not null                                 |
| email           | text      | not null                                 |
| phone           | text      | nullable                                 |
| dateOfBirth     | date      | nullable                                 |
| isDeleted       | boolean   | not null, default false                  |
| createdAt       | timestamp | default now                              |
| updatedAt       | timestamp | default now                              |

### Modified: `bookingGuests`

- `memberId` becomes nullable (currently not null)
- Add `associateId` (uuid, nullable, FK to associates)
- Add `portaCotRequested` (boolean, not null, default false)
- Add check constraint: exactly one of `memberId` or `associateId` must be non-null

### Modified: `membershipClasses`

- Add `isGuestClass` (boolean, not null, default false)
- Used to identify the tariff class for pricing associates
- Each org should have exactly one class flagged as guest class

### Modified: `lodges`

- Add `portaCotCount` (integer, not null, default 0)

### Modified: `tariffs`

- Add `portaCotPricePerNightCents` (integer, nullable)
- Single flat rate per night (no weekday/weekend split, no multi-night discounts)
- Varies by season/lodge and optionally by membership class

## Associate Management

### Member dashboard

New page at `/{slug}/associates`:

- Lists all saved associates belonging to the logged-in member
- CRUD: add, edit, delete
- Delete shows a warning if the associate has active/upcoming bookings.
  Force delete keeps the `bookingGuests.associateId` FK intact (cascade is
  not used). Instead, the associate row is soft-deleted by convention - the
  dashboard hides it but the FK remains valid for historical bookings.

### Server actions

- `createAssociate(data)` - validates required fields, creates row
- `updateAssociate(id, data)` - verifies caller is the owner
- `deleteAssociate(id)` - verifies caller is owner, warns if linked to bookings,
  sets `isDeleted = true` (soft delete preserves FK for historical bookings)
- `getMyAssociates(organisationId, memberId)` - returns non-deleted associates

### Auth

All associate actions require the owning member's session. Members can only
see/manage their own associates.

## Booking Flow Changes

### Step 2 - Add Guests (modified)

The guest search is extended with two sources:

- **Members tab** - existing behaviour, searches org members
- **Associates tab** - searches the booking member's saved associates

An **"Add New Associate"** inline form below the search collects: first name,
last name, email, phone, date of birth. A "Save for future bookings" checkbox
is checked by default. The associate is always persisted so it can be linked
from `bookingGuests`; if the user unchecks "save", the associate can be cleaned
up later or the member can delete from their dashboard.

Each guest row (member or associate) gets a **port-a-cot toggle**. When enabled,
a counter shows "X of Y cots available" based on the lodge total minus cots
booked for overlapping dates.

Associates display with a "Guest" badge instead of a membership class badge.

### Step 3 - Select Beds (modified)

- Guests with `portaCotRequested = true` skip bed selection. They show as
  "Port-a-cot (no bed assignment needed)".
- All other guests go through normal bed assignment.

### Pricing

**Associates:** Priced using the org's guest membership class (`isGuestClass = true`).
The system looks up the tariff for that class + season + lodge. If no guest tariff
exists, the booking flow shows an error: "Guest pricing not configured for this season."

**Port-a-cot guests:** Priced at `tariff.portaCotPricePerNightCents` x total nights.
Flat rate, no weekday/weekend variation, no multi-night discounts. The tariff is
looked up by the guest's membership class (or guest class for associates).

If a cot guest is an associate, the cot price comes from the guest-class tariff row.
If a cot guest is a member, the cot price comes from their own membership class tariff row.

### Confirm step

Associates displayed with full name + "(Guest)" label.

## Port-a-Cot Availability

- Lodge-level resource: `lodges.portaCotCount` sets the total pool.
- During booking, the system counts `portaCotRequested = true` across all
  confirmed/pending `bookingGuests` with overlapping dates at the same lodge.
- If requested cots would exceed the lodge total, the booking is rejected:
  "Only X port-a-cots available for these dates."

## Admin Setup

### Lodge detail page

- Existing room manager unchanged
- New "Port-a-Cots" field: number input for total cots at the lodge

### Tariff management

- Existing weekday/weekend price columns unchanged
- New "Port-a-Cot Price/Night" column per tariff row

### Guest membership class

- Admin creates a membership class (e.g. "Guest") and marks it as `isGuestClass`
- System enforces only one guest class per org
- Tariff rows for this class set pricing for associates

## Testing

### Unit/integration tests

- Associate CRUD (create, update, delete, owner-only access)
- Booking with mix of members + associates
- Guest tariff lookup: success case and "not configured" error
- Port-a-cot availability check across overlapping bookings
- Port-a-cot pricing calculation (flat rate x nights)
- Prevent booking when requested cots exceed lodge capacity
- `bookingGuests` check constraint: exactly one of memberId/associateId
- Delete associate linked to active booking (warning + force)

### Error states

- No guest tariff configured for season/lodge: block booking with message
- Port-a-cots fully booked for dates: show availability count, block booking
- Associate validation: first name, last name, email required
- Duplicate port-a-cot toggle not possible (boolean per guest)

## Migration

- Making `bookingGuests.memberId` nullable is backwards-compatible (all existing
  rows have it populated)
- New columns have defaults, no backfill needed
- Check constraint added after nullable change
- `isGuestClass` defaults to false, no impact on existing classes
- `portaCotCount` defaults to 0, no cots available until admin configures
- `portaCotPricePerNightCents` nullable, no pricing until configured
