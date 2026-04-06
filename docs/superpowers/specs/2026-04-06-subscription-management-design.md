# Phase 10: Subscription Management

Annual membership fee generation, payment, and tracking per season.

## Schema Changes

### `membershipClasses` — add column

- `annualFeeCents` (integer, nullable) — null means no fee for this class (e.g., honorary members)

### `organisations` — add column

- `subscriptionGraceDays` (integer, not null, default 14) — days after due date before auto-marking member non-financial

### `subscriptions` — add column

- `reminderSentAt` (timestamp with timezone, nullable) — tracks when the renewal reminder was last sent, prevents duplicate sends

### Existing tables — no further changes

- `subscriptions` — already has memberId, seasonId, amountCents, dueDate, status (UNPAID/PAID/WAIVED), paidAt, stripePaymentIntentId, waivedReason
- `transactions` — subscription payments create a record with type SUBSCRIPTION

**Migration:** One migration adding three columns (two on existing tables, one on subscriptions).

## Subscription Generation

### Auto-generate on season activation

When an admin sets a season's `isActive = true`, the system generates subscription records for all active organisation members whose membership class has a non-null `annualFeeCents`.

Each subscription gets:
- `memberId`, `seasonId`
- `amountCents` copied from the member's class `annualFeeCents`
- `dueDate` set to the season's `startDate`
- `status` = UNPAID

Rules:
- Skip members who already have a subscription for that season (idempotent)
- Skip membership classes with `annualFeeCents = null`
- Deactivating a season does not delete existing subscriptions

### Manual regenerate

Admin button: "Generate Missing Subscriptions" on the subscriptions page. Picks up new members added after initial generation or members whose class changed. Same idempotent logic — only creates records for members without an existing subscription for the season.

## Admin Subscriptions Page

**Route:** `[slug]/admin/subscriptions`

### List view

Table columns: member name, membership class, amount, due date, status (badge), paid date.

Filters:
- Season selector (defaults to active season)
- Status: All / Unpaid / Paid / Waived
- Membership class

Sort by: name, due date, status.

### Summary bar

Displayed above the table:
- Total expected revenue (sum of all amountCents for the season)
- Total collected (sum of PAID)
- Total outstanding (sum of UNPAID)
- Total waived (sum of WAIVED)

### Row actions

- **Waive** — sets status to WAIVED, requires a reason text input
- **Adjust amount** — edit amountCents for an individual subscription (e.g., pro-rated for mid-year joiners)
- **Record offline payment** — marks as PAID, sets paidAt to now, creates a SUBSCRIPTION transaction with description "Offline payment recorded by {admin name}"
- **Send reminder** — fires the `MembershipRenewalDueEmail` to that member

### Bulk actions

- "Generate Missing Subscriptions" button
- "Send Reminders to Unpaid" — bulk sends `MembershipRenewalDueEmail` to all UNPAID members for the selected season

## Member Dashboard

### Subscription card

Added to the dashboard alongside existing bookings and outstanding balance:

- Shows current season subscription: amount, due date, status badge (Unpaid / Paid / Waived)
- If UNPAID and org has Stripe connected: "Pay Subscription" button triggers Stripe Checkout
- If PAID: green "Paid" indicator with date
- If WAIVED: "Waived" indicator
- If no subscription exists for the current season: card not shown

### Outstanding balance update

The existing outstanding balance card includes unpaid subscription amount alongside unpaid booking amounts.

## Payment Flow

### Stripe Checkout

New server action: `createSubscriptionCheckoutSession`
- Creates a Stripe Checkout session for the subscription's `amountCents`
- Applies the organisation's platform fee (1% default, from `platformFeeBps`)
- Checkout session metadata includes `subscriptionId` for webhook matching

### Webhook processing

Extend the existing `checkout.session.completed` handler in `/api/webhooks/stripe/route.ts`:
- Check for `subscriptionId` in session metadata
- When found: update subscription status to PAID, set `paidAt`, store `stripePaymentIntentId`, create a SUBSCRIPTION transaction

No new webhook endpoints.

## Grace Period and Financial Status

### Daily cron endpoint

New API route: `/api/cron/subscriptions`

Called once daily by an external scheduler (GitHub Actions or similar). Performs two passes:

**Pass 1 — Send reminders:**
- Find all UNPAID subscriptions where `dueDate` is today (or has just passed and no reminder sent yet)
- Send `MembershipRenewalDueEmail` with `payUrl` pointing to the member dashboard

**Pass 2 — Grace period expiry:**
- Find all UNPAID subscriptions where `dueDate + org.subscriptionGraceDays` has passed
- For each: set `isFinancial = false` on the member
- Create a `financialStatusChange` record with reason "Subscription unpaid — grace period expired"
- Send `FinancialStatusChangedEmail`

### Cron security

The cron endpoint is protected by a shared secret in the `Authorization` header, matching an environment variable (`CRON_SECRET`).

## Email Integration

Templates already built in Phase 8 (deferred to this phase):
- `MembershipRenewalDueEmail` — used for due date reminders and manual admin sends
- `FinancialStatusChangedEmail` — used when grace period expires

No new email templates needed.

## Testing Strategy

- Unit tests: subscription generation logic (idempotency, class fee lookup, skip null fees)
- Unit tests: grace period calculation and financial status flip
- Unit tests: subscription checkout session creation
- Integration tests: webhook processing for subscription payments
- Integration tests: admin actions (waive, adjust, record offline payment)
- Integration tests: cron endpoint (reminder sending, grace period expiry)
