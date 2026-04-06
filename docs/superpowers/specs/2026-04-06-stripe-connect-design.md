# Phase 7: Stripe Connect — Design Spec

## Overview

Integrate Stripe Connect (Express accounts) into Snow Gum so clubs can accept booking payments from members. Each club onboards their own Stripe account via self-serve Express onboarding. Members pay outstanding invoices via Stripe Checkout (hosted page). A 1% platform fee is collected on each transaction via `application_fee_amount`.

## Payment Model

- **Invoice-first**: Booking confirmation creates an INVOICE transaction (existing behaviour). No payment is required at booking time.
- **Pay when ready**: Members see unpaid invoices on their dashboard and click "Pay Now" to go through Stripe Checkout.
- **No refunds in this phase**: Refund logic is deferred to Phase 11 (Cancellation Policies). Admins can issue refunds manually via the Stripe Dashboard.
- **Platform fee**: 1% of the booking total, invisible to the member. Deducted from the club's payout via `application_fee_amount`. Configurable per-organisation via `platformFeeBps` field for future flexibility.

## Architecture

**Approach**: Server Actions + API Routes — follows the existing codebase pattern. Server actions handle mutations (onboarding, checkout session creation). A single API route handles the Stripe webhook.

### Data Flow

#### 1. Stripe Connect Onboarding

1. Admin clicks "Connect with Stripe" in org settings
2. Server action calls `stripe.accounts.create({ type: 'express' })`
3. Saves `stripeConnectAccountId` to the organisation record
4. Server action calls `stripe.accountLinks.create()` with return/refresh URLs
5. Redirects admin to Stripe's hosted onboarding
6. On return, server action calls `stripe.accounts.retrieve()` to check `charges_enabled`
7. Sets `stripeConnectOnboardingComplete = true` if charges are enabled

#### 2. Member Payment

1. Member clicks "Pay Now" on an unpaid booking in their dashboard
2. Server action creates a Stripe Checkout Session:
   - `stripe_account`: the club's connected account ID
   - `application_fee_amount`: `applyBasisPoints(totalAmountCents, org.platformFeeBps)`
   - `line_items`: booking reference and amount
   - `metadata`: `{ transactionId, bookingId, organisationId }`
   - `success_url`: `/[slug]/payment/success?session_id={CHECKOUT_SESSION_ID}`
   - `cancel_url`: `/[slug]/payment/cancelled`
3. Client redirects to the Checkout Session URL
4. Member completes payment on Stripe's hosted page
5. Stripe sends `checkout.session.completed` webhook

#### 3. Webhook Processing

- **Endpoint**: `POST /api/webhooks/stripe`
- **Signature verification**: Using `STRIPE_WEBHOOK_SECRET` via `stripe.webhooks.constructEvent()`
- **Events handled**:
  - `checkout.session.completed`: Create PAYMENT transaction, update booking payment timestamps
  - `checkout.session.expired`: Log only, no DB changes
- **Idempotency**: Before creating a PAYMENT transaction, check if one already exists with the same `stripePaymentIntentId`. Skip if duplicate.

## Schema Changes

### New Fields

**organisations table:**
- `platform_fee_bps` — integer, NOT NULL, default 100 (1%). Per-club platform fee override.

**transactions table:**
- `stripe_checkout_session_id` — text, nullable. Links transaction to Stripe Checkout Session.
- `platform_fee_cents` — integer, nullable. Records the platform fee charged on this transaction.

### Existing Fields (no changes needed)

- `organisations.stripe_connect_account_id` — already exists
- `organisations.stripe_connect_onboarding_complete` — already exists
- `transactions.stripe_payment_intent_id` — already exists
- `bookings.deposit_amount_cents`, `deposit_paid_at`, `balance_due_date`, `balance_paid_at` — already exist

### Migration

One migration file adding the three new columns.

## New Files

```
src/
  lib/
    stripe.ts                              — Stripe client singleton, helper functions
  actions/stripe/
    onboarding.ts                          — createConnectAccount, generateOnboardingLink, verifyOnboarding
    checkout.ts                            — createCheckoutSession
  app/
    api/webhooks/stripe/
      route.ts                             — POST webhook handler
    [slug]/
      admin/settings/
        stripe-connect-card.tsx            — Onboarding UI card component
        stripe/
          return/page.tsx                  — Onboarding return page (verifies status)
          refresh/page.tsx                 — Re-generates onboarding link if expired
      dashboard/
        payment-button.tsx                 — "Pay Now" client component
      payment/
        success/page.tsx                   — Post-checkout success page
        cancelled/page.tsx                 — Checkout abandoned page
```

## Modified Files

- `src/db/schema/organisations.ts` — add `platformFeeBps`
- `src/db/schema/transactions.ts` — add `stripeCheckoutSessionId`, `platformFeeCents`
- `src/app/[slug]/admin/settings/page.tsx` — render StripeConnectCard
- `src/app/[slug]/dashboard/page.tsx` — add payment status bar and Pay Now button to booking cards

## UI Design

### Admin Settings — Stripe Connect Card

Three states:

**Not connected:** No `stripeConnectAccountId` on the org. Card with "Connect with Stripe" button, explanation text about accepting payments, "Not connected" badge (amber).

**Pending:** `stripeConnectAccountId` exists but `stripeConnectOnboardingComplete` is false. Card shows "Continue Setup" button to re-generate an onboarding link, "Pending" badge (amber).

**Connected:** Both fields set. Card showing truncated account ID, "Charges enabled" status, platform fee percentage, link to Stripe Dashboard. "Connected" badge (green).

### Member Dashboard — Booking Cards

Each booking card gets a payment status bar at the bottom:

- **Unpaid**: Amber dot, "Payment outstanding — $X.XX", green "Pay Now" button
- **Paid**: Green dot, "Paid — DD Mon YYYY"

Pay Now button is hidden if the organisation has no connected Stripe account.

### Payment Return Pages

**Success**: Green checkmark, "Payment Received", booking reference, amount, "Back to Dashboard" button.

**Cancelled**: Neutral icon, "Payment Cancelled", reassurance that no charge was made, "Back to Dashboard" button.

## Webhook Security

- Raw request body passed to `stripe.webhooks.constructEvent()` for signature verification
- Next.js API route must not parse the body — use `export const config = { api: { bodyParser: false } }` or equivalent App Router approach
- Return 200 for successfully processed events, 400 for signature failures
- Log unhandled event types but return 200 (don't block Stripe retries)

## Platform Fee

- Calculated using existing `applyBasisPoints(amountCents, org.platformFeeBps)`
- Default: 100 bps (1%)
- Passed as `application_fee_amount` on the Checkout Session
- Recorded in `transactions.platform_fee_cents` for reporting
- Invisible to the member — they pay the booking total, the club receives total minus fee

## Error Handling

- **Org not connected**: Pay Now button not rendered. If somehow called, server action returns error.
- **Onboarding incomplete**: Card shows "Pending" state with "Continue Setup" button to re-generate onboarding link.
- **Checkout session creation fails**: Server action returns error, displayed to member.
- **Webhook signature invalid**: Return 400, log warning.
- **Duplicate webhook**: Idempotency check prevents double-processing.
- **Member not authorised**: Server action checks session membership before creating checkout.

## Testing Strategy

All tests mock the Stripe SDK — no real API calls.

- **`lib/stripe.ts`**: Client initialization, helper functions, platform fee calculation
- **Onboarding actions**: Account creation, link generation, status verification, error cases (already connected, charges not enabled)
- **Checkout actions**: Session creation with correct params, rejects if org not connected, rejects if already paid
- **Webhook handler**: Signature verification, idempotent PAYMENT creation, correct DB updates, no-op for expired sessions
- **Components**: StripeConnectCard states (not connected / pending / connected), PaymentButton visibility and disabled states

## Out of Scope

- Refunds (Phase 11)
- Email notifications for payment events (Phase 8)
- Subscription/annual fee payments (Phase 10)
- Admin-side payment management (Phase 9)
- Stripe Connect dashboard link for viewing payouts (nice-to-have, not required)
