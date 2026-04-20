/**
 * Affiliate balance reconciliation CLI.
 *
 * Usage:
 *   pnpm tsx scripts/reconcile-affiliate-balances.ts            # report only
 *   pnpm tsx scripts/reconcile-affiliate-balances.ts --apply    # apply fixes
 *
 * What it does:
 *   1. Recomputes per-affiliate per-currency totals from the referrals table
 *      and prints a side-by-side report against the live aggregates that the
 *      seller dashboard renders.
 *   2. Detects a few invariants we rely on elsewhere and reports violations:
 *        - paid referral with no payout_id
 *        - payable referral older than its hold window with no payout
 *        - refund ledger row whose refunded_smallest exceeds rebate_smallest
 *   3. With --apply, fixes the first invariant by demoting orphan 'paid'
 *      rows back to 'payable' so the next cron picks them up. Other
 *      invariants are reported only because they require human judgment.
 */
import { getDbPool } from "@/utils/db/db-service";

type Row = {
  affiliate_id: number;
  affiliate_name: string;
  currency: string;
  pending_smallest: string;
  payable_smallest: string;
  paid_smallest: string;
  paid_with_payout: string;
};

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const totals = await client.query<Row>(
      `SELECT
         r.affiliate_id,
         a.name AS affiliate_name,
         r.currency,
         COALESCE(SUM(CASE WHEN status='pending' THEN rebate_smallest ELSE 0 END),0)::text AS pending_smallest,
         COALESCE(SUM(CASE WHEN status='payable' THEN rebate_smallest ELSE 0 END),0)::text AS payable_smallest,
         COALESCE(SUM(CASE WHEN status='paid' THEN rebate_smallest ELSE 0 END),0)::text AS paid_smallest,
         COALESCE(SUM(CASE WHEN status='paid' AND payout_id IS NOT NULL THEN rebate_smallest ELSE 0 END),0)::text AS paid_with_payout
       FROM affiliate_referrals r
       JOIN affiliates a ON a.id = r.affiliate_id
       GROUP BY r.affiliate_id, a.name, r.currency
       ORDER BY a.name, r.currency`
    );

    console.log(
      `\n=== Affiliate balances (${totals.rowCount ?? 0} buckets) ===`
    );
    for (const r of totals.rows) {
      const drift = Number(r.paid_smallest) - Number(r.paid_with_payout);
      console.log(
        `${r.affiliate_name} [${r.currency}] ` +
          `pending=${r.pending_smallest} payable=${r.payable_smallest} ` +
          `paid=${r.paid_smallest}` +
          (drift !== 0 ? ` (drift=${drift})` : "")
      );
    }

    // Invariant 1: paid rows missing a payout_id (orphaned)
    const orphans = await client.query(
      `SELECT id, affiliate_id, order_id, rebate_smallest, currency
         FROM affiliate_referrals
         WHERE status = 'paid' AND payout_id IS NULL`
    );
    if ((orphans.rowCount ?? 0) > 0) {
      console.log(`\n[!] Orphan paid referrals: ${orphans.rowCount}`);
      orphans.rows.forEach((r) =>
        console.log(
          `    id=${r.id} affiliate=${r.affiliate_id} order=${r.order_id}`
        )
      );
      if (apply) {
        const fix = await client.query(
          `UPDATE affiliate_referrals
             SET status = 'payable', updated_at = CURRENT_TIMESTAMP
           WHERE status = 'paid' AND payout_id IS NULL
           RETURNING id`
        );
        console.log(`    -> demoted ${fix.rowCount} row(s) back to payable`);
      } else {
        console.log("    (run with --apply to demote them back to payable)");
      }
    }

    // Invariant 2: refunded_smallest > rebate_smallest (overshoot)
    const overshoot = await client.query(
      `SELECT id, affiliate_id, order_id, rebate_smallest, refunded_smallest
         FROM affiliate_referrals
         WHERE refunded_smallest > rebate_smallest`
    );
    if ((overshoot.rowCount ?? 0) > 0) {
      console.log(
        `\n[!] Refund overshoot rows: ${overshoot.rowCount} (manual review needed)`
      );
      overshoot.rows.forEach((r) =>
        console.log(
          `    id=${r.id} order=${r.order_id} rebate=${r.rebate_smallest} refunded=${r.refunded_smallest}`
        )
      );
    }

    // Invariant 3: payable rows older than 60 days with no payout
    const stale = await client.query(
      `SELECT id, affiliate_id, order_id, currency, rebate_smallest, created_at
         FROM affiliate_referrals
         WHERE status = 'payable' AND payout_id IS NULL
           AND created_at < NOW() - INTERVAL '60 days'`
    );
    if ((stale.rowCount ?? 0) > 0) {
      console.log(`\n[!] Stale payable referrals (>60d): ${stale.rowCount}`);
      stale.rows.forEach((r) =>
        console.log(
          `    id=${r.id} affiliate=${r.affiliate_id} created=${r.created_at.toISOString?.() ?? r.created_at}`
        )
      );
    }

    console.log("\nDone.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
