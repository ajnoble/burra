/**
 * Seed Phase 12 financial data for Polski Ski Club
 * Adds transactions for existing bookings and subscriptions
 * Run: DATABASE_URL=... node scripts/seed-phase12-data.js
 */
const pg = require("pg");

const ORG_ID = "40942fc3-5605-407d-830e-9767609ddc0d";
const LODGE_ID = "4f9d91bc-51eb-4bd5-93d6-18fc4a1f2afd";

async function main() {
  const client = new pg.Client(process.env.DATABASE_URL);
  await client.connect();

  // Clean up any prior seed data
  await client.query("DELETE FROM transactions WHERE organisation_id = $1", [ORG_ID]);
  console.log("Cleared existing transactions");

  // Get confirmed bookings with member info
  const { rows: bookings } = await client.query(
    `SELECT b.id, b.primary_member_id, b.total_amount_cents, b.booking_reference, b.check_in_date, b.status
     FROM bookings b WHERE b.organisation_id = $1 AND b.status IN ('CONFIRMED', 'COMPLETED')
     ORDER BY b.check_in_date`,
    [ORG_ID]
  );
  console.log(`Found ${bookings.length} confirmed/completed bookings`);

  // Get paid subscriptions
  const { rows: paidSubs } = await client.query(
    `SELECT s.id, s.member_id, s.amount_cents, s.paid_at
     FROM subscriptions s WHERE s.organisation_id = $1 AND s.status = 'PAID'`,
    [ORG_ID]
  );
  console.log(`Found ${paidSubs.length} paid subscriptions`);

  // Get cancelled booking for refund
  const { rows: cancelledBookings } = await client.query(
    `SELECT b.id, b.primary_member_id, b.total_amount_cents, b.booking_reference
     FROM bookings b WHERE b.organisation_id = $1 AND b.status = 'CANCELLED'`,
    [ORG_ID]
  );

  let txCount = 0;

  // 1. Insert PAYMENT transactions for each confirmed booking
  // Spread dates: some in current month, some in prior months for MTD/YTD comparison
  for (const b of bookings) {
    // Payment date is 14 days before check-in
    const checkIn = new Date(b.check_in_date);
    const paymentDate = new Date(checkIn);
    paymentDate.setDate(paymentDate.getDate() - 14);

    const platformFee = Math.round(b.total_amount_cents * 0.01);

    await client.query(
      `INSERT INTO transactions (organisation_id, member_id, booking_id, type, amount_cents, platform_fee_cents, description, created_at)
       VALUES ($1, $2, $3, 'PAYMENT', $4, $5, $6, $7)`,
      [
        ORG_ID,
        b.primary_member_id,
        b.id,
        b.total_amount_cents,
        platformFee,
        `Booking payment ${b.booking_reference}`,
        paymentDate.toISOString(),
      ]
    );
    txCount++;
  }
  console.log(`Inserted ${bookings.length} booking payment transactions`);

  // 2. Insert SUBSCRIPTION transactions for paid subscriptions
  for (const s of paidSubs) {
    await client.query(
      `INSERT INTO transactions (organisation_id, member_id, type, amount_cents, platform_fee_cents, description, created_at)
       VALUES ($1, $2, 'SUBSCRIPTION', $3, $4, $5, $6)`,
      [
        ORG_ID,
        s.member_id,
        s.amount_cents,
        Math.round(s.amount_cents * 0.01),
        "Annual subscription payment - Winter 2026",
        s.paid_at,
      ]
    );
    txCount++;
  }
  console.log(`Inserted ${paidSubs.length} subscription transactions`);

  // 3. Insert REFUND for cancelled booking
  for (const b of cancelledBookings) {
    // Original payment
    const paymentDate = new Date("2026-03-15");
    const refundDate = new Date("2026-03-20");
    const platformFee = Math.round(b.total_amount_cents * 0.01);

    await client.query(
      `INSERT INTO transactions (organisation_id, member_id, booking_id, type, amount_cents, platform_fee_cents, description, created_at)
       VALUES ($1, $2, $3, 'PAYMENT', $4, $5, $6, $7)`,
      [
        ORG_ID,
        b.primary_member_id,
        b.id,
        b.total_amount_cents,
        platformFee,
        `Booking payment ${b.booking_reference}`,
        paymentDate.toISOString(),
      ]
    );
    txCount++;

    // Refund (negative amount)
    await client.query(
      `INSERT INTO transactions (organisation_id, member_id, booking_id, type, amount_cents, platform_fee_cents, description, created_at)
       VALUES ($1, $2, $3, 'REFUND', $4, $5, $6, $7)`,
      [
        ORG_ID,
        b.primary_member_id,
        b.id,
        -b.total_amount_cents,
        0,
        `Refund for cancelled booking ${b.booking_reference}`,
        refundDate.toISOString(),
      ]
    );
    txCount++;
  }
  console.log(`Inserted ${cancelledBookings.length} refund pairs`);

  // 4. Add a few INVOICE transactions (outstanding balances)
  const { rows: pendingBookings } = await client.query(
    `SELECT b.id, b.primary_member_id, b.total_amount_cents, b.booking_reference
     FROM bookings b WHERE b.organisation_id = $1 AND b.status = 'PENDING'`,
    [ORG_ID]
  );

  for (const b of pendingBookings) {
    await client.query(
      `INSERT INTO transactions (organisation_id, member_id, booking_id, type, amount_cents, description, created_at)
       VALUES ($1, $2, $3, 'INVOICE', $4, $5, $6)`,
      [
        ORG_ID,
        b.primary_member_id,
        b.id,
        b.total_amount_cents,
        `Invoice for booking ${b.booking_reference}`,
        new Date("2026-04-01").toISOString(),
      ]
    );
    txCount++;
  }
  console.log(`Inserted ${pendingBookings.length} invoice transactions`);

  console.log(`\nTotal transactions inserted: ${txCount}`);

  // 5. Verify
  const { rows: verify } = await client.query(
    "SELECT type, COUNT(*) as count, SUM(amount_cents) as total FROM transactions WHERE organisation_id = $1 GROUP BY type ORDER BY type",
    [ORG_ID]
  );
  console.log("\nTransaction summary:");
  verify.forEach((r) =>
    console.log(`  ${r.type}: ${r.count} txns, $${(r.total / 100).toFixed(2)}`)
  );

  await client.end();
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
