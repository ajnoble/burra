# Phase 19 — GST/Tax Management Design

## Overview

Add GST (Goods and Services Tax) support to the Snow Gum platform. Organisations can optionally enable GST, which extracts and displays the GST component from existing GST-inclusive prices. No price changes — just disclosure of the tax component already embedded in amounts.

## Decisions

- **Australian GST only**, with per-org toggle (not all orgs are GST-registered)
- **GST-inclusive pricing** — all admin-entered amounts include GST. System extracts GST via `amount × rate / (10000 + rate)`
- **Retroactive display** — enabling GST reveals the GST component on existing unpaid items without changing amounts
- **Email receipts with GST breakdown** — no PDF invoices this phase
- **Xero-compatible CSV** — uses Xero's expected column names (`Tax Amount`, `Tax Type`)
- **Approach A** — store `gstAmountCents` on existing financial tables rather than a separate tax ledger

## Data Model Changes

### Organisations table — new fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `gstEnabled` | boolean | false | Whether org charges GST |
| `gstRateBps` | integer | 1000 | GST rate in basis points (1000 = 10%) |
| `abnNumber` | text (nullable) | null | Australian Business Number; required when GST enabled |

### Transactions table — new field

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `gstAmountCents` | integer | 0 | GST component of the transaction amount |

### Checkout Line Items table — new field

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `gstAmountCents` | integer | 0 | GST component per line item |

### Bookings table — new field

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `gstAmountCents` | integer | 0 | GST on the total booking amount |

### Subscriptions table — new field

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `gstAmountCents` | integer | 0 | GST on the subscription fee |

### Charges table — new field

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `gstAmountCents` | integer | 0 | GST on the charge amount |

### GST calculation (inclusive)

```
gstAmountCents = Math.round(amountCents * gstRateBps / (10000 + gstRateBps))
// For 10%: Math.round(amountCents / 11)
```

GST is calculated and stored when:
- A charge/subscription/booking is **created** (for display on reminders/invoices)
- A payment **completes** (stored on the transaction for reporting)

## Organisation Settings UI

Admin Settings page gets a new "GST / Tax" section:

- **Enable GST** toggle — off by default
- When enabled, reveals:
  - **ABN** text field — validated as 11 digits (with optional spaces: `XX XXX XXX XXX`). Required when GST is enabled.
  - **GST Rate** — displayed as "10%" (read-only). Stored as `gstRateBps = 1000`.
- Saving with GST enabled but no ABN shows a validation error.

No retroactive recalculation job needed. Since pricing is GST-inclusive, enabling GST doesn't change any amounts. The GST component is calculated on-the-fly for existing unpaid items when displayed, and stored on the transaction when payment completes.

The ABN appears on: email receipts, Xero CSV export, GST summary report.

## GST Calculation & Payment Flow

### New utility

`calculateGst(amountCents: number, gstRateBps: number): number` in `src/lib/currency.ts`. Returns the GST component from a GST-inclusive amount.

### Charge/subscription/booking creation

- Look up org's `gstEnabled` and `gstRateBps`
- If GST enabled, calculate and store `gstAmountCents` on the record
- If GST not enabled, `gstAmountCents` stays 0

### Displaying unpaid items

For items created before GST was enabled (`gstAmountCents = 0` but org now has GST on), calculate GST on-the-fly for display. The stored value gets written when payment completes.

### Checkout session changes

- Stripe line item names include GST note when applicable: e.g. "Membership Fee — Winter 2027 (incl. GST)"
- Stripe checkout session metadata gets `gstAmountCents` for audit trail
- No change to actual amounts — prices are GST-inclusive, Stripe sees the same totals

### Webhook handler changes

- When creating the transaction on payment completion, calculate and store `gstAmountCents`
- For consolidated checkouts, store `gstAmountCents` on each line item's corresponding transaction
- Use the org's GST rate at time of payment for the transaction record

## Email Receipt Changes

### Receipt templates (GST-enabled org)

Currently: `Amount paid: $110.00`

With GST:
```
Subtotal (excl. GST): $100.00
GST (10%):             $10.00
Total:                $110.00

ABN: 12 345 678 901
```

### Templates affected

**Receipts (show full GST breakdown + ABN):**
- `payment-received.tsx` — single booking receipt
- `consolidated-payment-received.tsx` — multi-item receipt (per-line-item GST breakdown plus totals)

**Reminders (append "(incl. GST)" to amounts):**
- `booking-payment-reminder.tsx`
- `charge-created.tsx`
- `charge-due-reminder.tsx`
- `membership-renewal-due.tsx`

### Props changes

- Receipt templates: add `gstEnabled`, `gstAmountCents`, `abnNumber`
- Reminder templates: add `gstEnabled` for the "(incl. GST)" label
- Conditional rendering — no GST section when org has GST disabled

## Reporting & CSV Export

### GST Summary Report

New report page at `admin/reports/gst-summary`:

- Period selector: monthly or quarterly (BAS-aligned)
- Date range picker defaulting to current quarter
- Breakdown by category:

| Period | Bookings GST | Subscriptions GST | Charges GST | Total GST Collected |
|--------|-------------|-------------------|-------------|-------------------|
| Jan 2027 | $450.00 | $1,200.00 | $85.00 | $1,735.00 |
| **Total** | ... | ... | ... | **$X,XXX.XX** |

- Queries `transactions` table, grouping by type and period, summing `gstAmountCents`
- Only visible when org has GST enabled
- Downloadable as CSV

### Transaction Ledger — updated

- New "GST" column showing `gstAmountCents` per transaction
- Existing "Amount" column stays as-is (total inclusive amount)

### Xero CSV Export — updated

| Date | Amount | Tax Amount | Tax Type | Payee | Description | Reference |
|------|--------|-----------|----------|-------|-------------|-----------|

- `Tax Amount`: GST in dollars (`gstAmountCents / 100`)
- `Tax Type`: `"GST on Income"` when org has GST enabled, `"No GST"` when not
- Column names match Xero's expected format for clean import

### Revenue Summary Report — updated

- Add `gstCollectedCents` to each period row
- Show net revenue both inclusive and exclusive of GST

## Testing Strategy

### Unit tests

- `calculateGst` — correct rounding for various amounts and rates ($0, $0.01, large amounts)
- GST calculation on charge/subscription/booking creation — enabled vs disabled
- ABN validation — valid formats, invalid formats, edge cases

### Integration tests

- Checkout flow with GST-enabled org: `gstAmountCents` stored on transaction after webhook
- Consolidated checkout: per-line-item GST amounts
- Enabling GST on org with existing unpaid charges: GST displays correctly
- Disabling GST: receipts stop showing GST breakdown

### Report tests

- GST summary: correct aggregation by period and category
- Xero export: correct column names and values, `"GST on Income"` vs `"No GST"`
- Transaction ledger: GST column populated
- Revenue summary: GST totals match

### Email template tests

- Receipt with GST: shows subtotal/GST/total/ABN
- Receipt without GST: shows amount only
- Reminders with GST: "(incl. GST)" appended

## Out of Scope

- PDF invoice generation
- Multi-currency or multi-country tax
- GST on purchases/expenses tracking
- Tax exemptions per member or per item
- Editable GST rate (fixed at 10% for now, stored as basis points for future flexibility)
