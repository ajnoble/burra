# Phase 13 — One-Off Charges & Family Fee Consolidation

## Overview

Add the ability for admins to create ad-hoc charges against members (locker fees, cleaning, events, etc.) with admin-defined categories, and allow primary family members to pay all outstanding charges across their family in a single Stripe Checkout session.

## Data Model

### `charge_categories` table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| organisationId | uuid | FK to organisations |
| name | text | e.g. "Locker Fee", "Cleaning Fee" |
| description | text | optional |
| sortOrder | integer | default 0 |
| isActive | boolean | default true |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

### `one_off_charges` table

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| organisationId | uuid | FK to organisations |
| memberId | uuid | FK to members |
| categoryId | uuid | FK to charge_categories |
| description | text | optional free text |
| amountCents | integer | positive |
| dueDate | date | optional |
| status | enum | UNPAID, PAID, WAIVED, CANCELLED |
| waivedReason | text | set when status = WAIVED |
| paidAt | timestamptz | set when paid |
| stripePaymentIntentId | text | set when paid via Stripe |
| transactionId | uuid | FK to transactions, set when paid |
| createdByMemberId | uuid | FK to members (admin who created it) |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

### `checkout_line_items` table

Maps a single Stripe Checkout session to multiple charges across multiple members.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| stripeCheckoutSessionId | text | Stripe session ID |
| chargeType | enum | ONE_OFF_CHARGE, SUBSCRIPTION, BOOKING_INVOICE |
| chargeId | uuid | ID of the source record |
| amountCents | integer | amount for this line item |
| memberId | uuid | FK to members |
| createdAt | timestamptz | |

On webhook success, iterate `checkout_line_items` to update each source record and create per-member PAYMENT transactions.

### `one_off_charge_status` enum

Values: `UNPAID`, `PAID`, `WAIVED`, `CANCELLED`

### `checkout_charge_type` enum

Values: `ONE_OFF_CHARGE`, `SUBSCRIPTION`, `BOOKING_INVOICE`

## Admin UI

### Charge Categories (Settings)

- New section under `/{slug}/admin/settings` for managing charge categories
- Table with columns: name, description, sort order, active toggle
- Add/edit via dialog

### Dedicated Charges Page — `/{slug}/admin/charges`

- New admin nav item: "Charges"
- Table of all one-off charges across all members
- Filters: status, category, member, date range
- "New Charge" button opens dialog with: member search/select, category select, amount, optional description, optional due date
- Bulk creation: select multiple members, create the same charge for all (e.g. "Locker Fee $50" for 20 members)

### Member Detail Page — Charges Tab

- New tab on `/{slug}/admin/members/{memberId}`
- Table of all one-off charges for that member
- Status badges: Unpaid, Paid, Waived, Cancelled
- Actions per charge: waive (with reason), cancel, mark as paid manually (cash/bank transfer)
- "Add Charge" button — dialog with category, amount, optional description, optional due date (member pre-selected)
- For primary family members: toggle to show charges across all family members

## Member-Facing UI

### Family Charges View (Dashboard)

- Primary members see a "Family" section on their dashboard
- Outstanding charges grouped by family member (self + dependents)
- Each charge shows: category, description, amount, due date (if set), status
- Total outstanding balance displayed prominently

### Payment Flows

- **Pay individual:** "Pay" button on a single charge creates a Stripe Checkout session for that charge
- **Pay all outstanding:** "Pay All Outstanding" button creates a single Stripe Checkout session summing all unpaid charges across the family (one-off charges + unpaid subscriptions + unpaid booking invoices)
- **Cherry-pick:** Checkboxes to select specific charges, then "Pay Selected" creates a Stripe Checkout for the selected items only

### Stripe Checkout Integration

A new `createConsolidatedCheckoutSession` server action:

1. Query all selected/outstanding items across charge types
2. Create `checkout_line_items` records mapping session to source charges
3. Build Stripe Checkout session with line items and platform fee
4. On webhook success, for each `checkout_line_item`:
   - Create a PAYMENT transaction in the ledger for the correct member
   - Update the source record (charge/subscription/invoice) status to PAID
   - Set `paidAt`, `stripePaymentIntentId`, `transactionId`

The existing single-booking checkout (`createCheckoutSession`) continues to work unchanged.

## Reports & Ledger Integration

- **Transaction ledger:** One-off charge payments flow through the `transactions` table automatically
- **Member balances:** Updated to include unpaid one-off charges in outstanding balance calculation
- **Revenue summary:** One-off charge payments included in revenue totals
- **Xero export:** Transactions include the category name in the description for clean export

No new report types needed.

## Email Notifications

Three new email templates:

1. **Charge Created:** Sent to member when admin creates a charge. Includes: category, amount, description, due date (if set), pay link.
2. **Payment Confirmation:** Sent on successful payment. For consolidated payments: lists all items paid with per-member breakdown and total.
3. **Due Date Reminder:** Sent 7 days before due date for charges with a due date set. Reuses the existing cron job pattern from subscription reminders.

## Technical Notes

- All amounts in cents, consistent with existing convention
- Platform fee applied on consolidated checkout same as existing booking checkout
- Family linking uses existing `primaryMemberId` on `members` table — no schema changes needed for family relationships
- Charge status transitions: UNPAID -> PAID (via payment), UNPAID -> WAIVED (admin), UNPAID -> CANCELLED (admin). No reverse transitions.
- Manual "mark as paid" creates a PAYMENT transaction with description "Manual payment (cash/bank transfer)" and no Stripe IDs. Sets charge status to PAID and `paidAt` to current time.
