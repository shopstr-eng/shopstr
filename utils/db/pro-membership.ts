// Database access layer for the Pro membership tier. Mirrors the structure of
// `utils/db/affiliates.ts`: table DDL lives in `db/schema.sql` and the inline
// `initializeTables()` migration in `utils/db/db-service.ts`; this module only
// holds query helpers and imports the shared pool.

import { getDbPool } from "@/utils/db/db-service";
import {
  PRO_MANUAL_GRACE_DAYS,
  PRO_READONLY_DAYS,
  type ProManualMethod,
  type ProMembershipRow,
  type ProTerm,
} from "@/utils/pro/constants";

// ---------------------------------------------------------------------------
// Memberships
// ---------------------------------------------------------------------------

export async function getProMembership(
  pubkey: string
): Promise<ProMembershipRow | null> {
  let client;
  try {
    client = await getDbPool().connect();
    const result = await client.query(
      `SELECT * FROM pro_memberships WHERE pubkey = $1`,
      [pubkey]
    );
    return result.rows[0] ?? null;
  } finally {
    if (client) client.release();
  }
}

export async function getProMembershipBySubscription(
  subscriptionId: string
): Promise<ProMembershipRow | null> {
  let client;
  try {
    client = await getDbPool().connect();
    const result = await client.query(
      `SELECT * FROM pro_memberships WHERE stripe_subscription_id = $1`,
      [subscriptionId]
    );
    return result.rows[0] ?? null;
  } finally {
    if (client) client.release();
  }
}

/**
 * Grant a 3-month trial to a seller iff they have no membership row yet.
 * Used by the one-time backfill; ON CONFLICT keeps it idempotent.
 */
export async function grantProTrialIfMissing(args: {
  pubkey: string;
  trialEnd: Date;
  graceUntil: Date;
  readonlyUntil: Date;
}): Promise<boolean> {
  let client;
  try {
    client = await getDbPool().connect();
    const result = await client.query(
      `INSERT INTO pro_memberships
         (pubkey, status, trial_end, grace_until, readonly_until)
       VALUES ($1, 'trialing', $2, $3, $4)
       ON CONFLICT (pubkey) DO NOTHING`,
      [args.pubkey, args.trialEnd, args.graceUntil, args.readonlyUntil]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    if (client) client.release();
  }
}

/**
 * Full Stripe state write — grants/renews entitlement by setting the period and
 * its lapse timeline. Used when a subscription is active/trialing and paid.
 */
export async function applyProStripeState(args: {
  pubkey: string;
  customerId: string;
  subscriptionId: string;
  baseStatus: string;
  term: ProTerm;
  currentPeriodEnd: Date;
  graceUntil: Date;
  readonlyUntil: Date;
  cancelAtPeriodEnd: boolean;
}): Promise<void> {
  let client;
  try {
    client = await getDbPool().connect();
    await client.query(
      `INSERT INTO pro_memberships
         (pubkey, billing_method, term, status, stripe_customer_id,
          stripe_subscription_id, current_period_end, grace_until,
          readonly_until, cancel_at_period_end, updated_at)
       VALUES ($1, 'stripe', $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (pubkey) DO UPDATE SET
         billing_method = 'stripe',
         term = EXCLUDED.term,
         status = EXCLUDED.status,
         stripe_customer_id = EXCLUDED.stripe_customer_id,
         stripe_subscription_id = EXCLUDED.stripe_subscription_id,
         current_period_end = EXCLUDED.current_period_end,
         grace_until = EXCLUDED.grace_until,
         readonly_until = EXCLUDED.readonly_until,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         -- A fresh paid period resets reminder bookkeeping.
         trial_reminder_sent_at = NULL,
         due_reminder_sent_at = NULL,
         readonly_notice_sent_at = NULL,
         hidden_notice_sent_at = NULL,
         updated_at = now()`,
      [
        args.pubkey,
        args.term,
        args.baseStatus,
        args.customerId,
        args.subscriptionId,
        args.currentPeriodEnd,
        args.graceUntil,
        args.readonlyUntil,
        args.cancelAtPeriodEnd,
      ]
    );
  } finally {
    if (client) client.release();
  }
}

/**
 * Partial Stripe sync — updates customer/subscription ids, base status, term
 * and cancel flag WITHOUT touching the entitlement timeline. Used for
 * incomplete/canceled/past-due states so we don't accidentally grant or revoke
 * access.
 */
export async function syncProStripeMeta(args: {
  pubkey: string;
  customerId: string;
  subscriptionId: string;
  baseStatus: string;
  term: ProTerm;
  cancelAtPeriodEnd: boolean;
}): Promise<void> {
  let client;
  try {
    client = await getDbPool().connect();
    await client.query(
      `INSERT INTO pro_memberships
         (pubkey, billing_method, term, status, stripe_customer_id,
          stripe_subscription_id, cancel_at_period_end, updated_at)
       VALUES ($1, 'stripe', $2, $3, $4, $5, $6, now())
       ON CONFLICT (pubkey) DO UPDATE SET
         billing_method = 'stripe',
         term = EXCLUDED.term,
         status = EXCLUDED.status,
         stripe_customer_id = EXCLUDED.stripe_customer_id,
         stripe_subscription_id = EXCLUDED.stripe_subscription_id,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         updated_at = now()`,
      [
        args.pubkey,
        args.term,
        args.baseStatus,
        args.customerId,
        args.subscriptionId,
        args.cancelAtPeriodEnd,
      ]
    );
  } finally {
    if (client) client.release();
  }
}

/**
 * Extend (or start) a membership period from a confirmed manual payment.
 */
export async function applyProManualState(args: {
  pubkey: string;
  term: ProTerm;
  currentPeriodEnd: Date;
  graceUntil: Date;
  readonlyUntil: Date;
}): Promise<void> {
  let client;
  try {
    client = await getDbPool().connect();
    await client.query(
      `INSERT INTO pro_memberships
         (pubkey, billing_method, term, status, current_period_end,
          grace_until, readonly_until, cancel_at_period_end, updated_at)
       VALUES ($1, 'manual', $2, 'active', $3, $4, $5, FALSE, now())
       ON CONFLICT (pubkey) DO UPDATE SET
         billing_method = 'manual',
         term = EXCLUDED.term,
         status = 'active',
         current_period_end = EXCLUDED.current_period_end,
         grace_until = EXCLUDED.grace_until,
         readonly_until = EXCLUDED.readonly_until,
         cancel_at_period_end = FALSE,
         trial_reminder_sent_at = NULL,
         due_reminder_sent_at = NULL,
         readonly_notice_sent_at = NULL,
         hidden_notice_sent_at = NULL,
         updated_at = now()`,
      [
        args.pubkey,
        args.term,
        args.currentPeriodEnd,
        args.graceUntil,
        args.readonlyUntil,
      ]
    );
  } finally {
    if (client) client.release();
  }
}

/**
 * Atomically extend a manual membership in a single statement. The new period
 * stacks from GREATEST(now, current_period_end, trial_end) so two invoices
 * settling concurrently can't both read the same prior end and clobber each
 * other (read-modify-write race). All lapse math is computed in SQL from that
 * base. `termInterval` is a Postgres interval literal ('1 month' | '1 year');
 * `graceDays`/`readonlyDays` mirror the JS lapse timeline.
 */
// Shared manual-extension statement. Params: $1 pubkey, $2 term, $3 term
// interval ('1 month' | '1 year'), $4 grace days, $5 read-only days. The new
// period stacks from GREATEST(now, current_period_end, trial_end) so early
// renewals extend rather than truncate. Designed to run inside a transaction
// alongside the invoice settle so the two commit/rollback together. Returns the
// new current_period_end so the caller can persist the exact coverage window
// (coverage_end = new period end; coverage_start = that minus one term) on the
// settling invoice without re-deriving it from a separate base.
const MANUAL_EXTEND_SQL = `
  INSERT INTO pro_memberships
    (pubkey, billing_method, term, status, current_period_end,
     grace_until, readonly_until, cancel_at_period_end, updated_at)
  VALUES (
    $1, 'manual', $2, 'active',
    now() + $3::interval,
    now() + $3::interval + make_interval(days => $4),
    now() + $3::interval + make_interval(days => $4) + make_interval(days => $5),
    FALSE, now()
  )
  ON CONFLICT (pubkey) DO UPDATE SET
    billing_method = 'manual',
    term = EXCLUDED.term,
    status = 'active',
    current_period_end =
      GREATEST(now(), pro_memberships.current_period_end, pro_memberships.trial_end)
      + $3::interval,
    grace_until =
      GREATEST(now(), pro_memberships.current_period_end, pro_memberships.trial_end)
      + $3::interval + make_interval(days => $4),
    readonly_until =
      GREATEST(now(), pro_memberships.current_period_end, pro_memberships.trial_end)
      + $3::interval + make_interval(days => $4) + make_interval(days => $5),
    cancel_at_period_end = FALSE,
    trial_reminder_sent_at = NULL,
    due_reminder_sent_at = NULL,
    readonly_notice_sent_at = NULL,
    hidden_notice_sent_at = NULL,
    updated_at = now()
  RETURNING current_period_end`;

export type ProSettleOutcome =
  | "settled"
  | "already_settled"
  | "not_found"
  | "not_settleable";

/**
 * Atomically + idempotently settle a manual invoice: flip it paid, stamp
 * `membership_applied_at`, and extend the membership — all in ONE transaction
 * with a row lock on the invoice. Either everything commits or nothing does,
 * so a partial failure (extension throws after the paid flip) rolls back and a
 * retry re-runs cleanly. The `membership_applied_at` guard ensures the
 * extension is applied exactly once even if called repeatedly (verify polling +
 * operator confirm), so paid time is never lost or double-counted.
 */
export async function settleProManualInvoiceAtomic(args: {
  invoiceId: string;
  graceDays?: number;
  readonlyDays?: number;
}): Promise<{
  outcome: ProSettleOutcome;
  invoice: ProManualInvoiceRow | null;
}> {
  const graceDays = args.graceDays ?? PRO_MANUAL_GRACE_DAYS;
  const readonlyDays = args.readonlyDays ?? PRO_READONLY_DAYS;

  let client;
  try {
    client = await getDbPool().connect();
    await client.query("BEGIN");

    const sel = await client.query(
      `SELECT * FROM pro_manual_invoices WHERE invoice_id = $1 FOR UPDATE`,
      [args.invoiceId]
    );
    const invoice = sel.rows[0] as ProManualInvoiceRow | undefined;

    if (!invoice) {
      await client.query("ROLLBACK");
      return { outcome: "not_found", invoice: null };
    }

    // Already fully settled — extension was applied, so do nothing (idempotent).
    if (invoice.membership_applied_at) {
      await client.query("COMMIT");
      return { outcome: "already_settled", invoice };
    }

    // Only settle invoices that are still open or paid-but-not-yet-applied
    // (recovery from a prior partial failure). Never resurrect an `expired` or
    // `canceled` invoice into a paid membership.
    if (invoice.status !== "pending" && invoice.status !== "paid") {
      await client.query("ROLLBACK");
      return { outcome: "not_settleable", invoice };
    }

    const termInterval = invoice.term === "yearly" ? "1 year" : "1 month";

    // Extend the membership first so we learn the exact new period end this
    // charge bought, then stamp that window onto the invoice. coverage_end is
    // the new current_period_end; coverage_start is one term earlier (the base
    // the stacking started from). Both are persisted in the same transaction so
    // the billing history can read the real window instead of replaying the
    // stacking heuristic.
    const ext = await client.query(MANUAL_EXTEND_SQL, [
      invoice.pubkey,
      invoice.term,
      termInterval,
      graceDays,
      readonlyDays,
    ]);
    const coverageEnd = ext.rows[0]?.current_period_end ?? null;

    await client.query(
      `UPDATE pro_manual_invoices
         SET status = 'paid',
             paid_at = COALESCE(paid_at, now()),
             membership_applied_at = now(),
             coverage_start = $2::timestamp - $3::interval,
             coverage_end = $2::timestamp,
             updated_at = now()
       WHERE invoice_id = $1`,
      [args.invoiceId, coverageEnd, termInterval]
    );

    await client.query("COMMIT");
    return { outcome: "settled", invoice };
  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback failure; original error is rethrown below
      }
    }
    throw err;
  } finally {
    if (client) client.release();
  }
}

export async function setProMembershipCancel(
  pubkey: string,
  cancelAtPeriodEnd: boolean
): Promise<void> {
  let client;
  try {
    client = await getDbPool().connect();
    await client.query(
      `UPDATE pro_memberships
       SET cancel_at_period_end = $2,
           status = CASE WHEN $2 THEN 'canceled' ELSE status END,
           updated_at = now()
       WHERE pubkey = $1`,
      [pubkey, cancelAtPeriodEnd]
    );
  } finally {
    if (client) client.release();
  }
}

export async function listAllProMemberships(): Promise<ProMembershipRow[]> {
  let client;
  try {
    client = await getDbPool().connect();
    const result = await client.query(`SELECT * FROM pro_memberships`);
    return result.rows;
  } finally {
    if (client) client.release();
  }
}

export type ProReminderColumn =
  | "trial_reminder_sent_at"
  | "due_reminder_sent_at"
  | "readonly_notice_sent_at"
  | "hidden_notice_sent_at";

export async function markProReminderSent(
  pubkey: string,
  column: ProReminderColumn
): Promise<void> {
  let client;
  try {
    client = await getDbPool().connect();
    // Column name is from a fixed allow-listed union, never user input.
    await client.query(
      `UPDATE pro_memberships SET ${column} = now(), updated_at = now() WHERE pubkey = $1`,
      [pubkey]
    );
  } finally {
    if (client) client.release();
  }
}

// ---------------------------------------------------------------------------
// Manual invoices
// ---------------------------------------------------------------------------

export interface ProManualInvoiceRow {
  id: number;
  invoice_id: string;
  pubkey: string;
  term: ProTerm;
  method: ProManualMethod;
  amount_usd_cents: number;
  amount_sats: number | null;
  bolt11: string | null;
  verify_url: string | null;
  payment_hash: string | null;
  status: "pending" | "paid" | "expired" | "canceled";
  due_at: string | Date;
  paid_at: string | Date | null;
  membership_applied_at: string | Date | null;
  // Exact entitlement window this charge paid for, stamped at settle time.
  // Null for invoices settled before this was persisted (falls back to the
  // reconstruction in `computeManualCoverage`).
  coverage_start: string | Date | null;
  coverage_end: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export async function createProManualInvoice(args: {
  invoiceId: string;
  pubkey: string;
  term: ProTerm;
  method: ProManualMethod;
  amountUsdCents: number;
  amountSats?: number | null;
  bolt11?: string | null;
  verifyUrl?: string | null;
  paymentHash?: string | null;
  dueAt: Date;
}): Promise<ProManualInvoiceRow> {
  let client;
  try {
    client = await getDbPool().connect();
    const result = await client.query(
      `INSERT INTO pro_manual_invoices
         (invoice_id, pubkey, term, method, amount_usd_cents, amount_sats,
          bolt11, verify_url, payment_hash, status, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
       RETURNING *`,
      [
        args.invoiceId,
        args.pubkey,
        args.term,
        args.method,
        args.amountUsdCents,
        args.amountSats ?? null,
        args.bolt11 ?? null,
        args.verifyUrl ?? null,
        args.paymentHash ?? null,
        args.dueAt,
      ]
    );
    return result.rows[0];
  } finally {
    if (client) client.release();
  }
}

export async function getProManualInvoice(
  invoiceId: string
): Promise<ProManualInvoiceRow | null> {
  let client;
  try {
    client = await getDbPool().connect();
    const result = await client.query(
      `SELECT * FROM pro_manual_invoices WHERE invoice_id = $1`,
      [invoiceId]
    );
    return result.rows[0] ?? null;
  } finally {
    if (client) client.release();
  }
}

/**
 * All settled (paid) manual invoices for a seller, newest first. Powers the
 * billing-history view alongside Stripe invoices.
 */
export async function listPaidProManualInvoices(
  pubkey: string
): Promise<ProManualInvoiceRow[]> {
  let client;
  try {
    client = await getDbPool().connect();
    const result = await client.query(
      `SELECT * FROM pro_manual_invoices
       WHERE pubkey = $1 AND status = 'paid'
       ORDER BY paid_at DESC NULLS LAST, created_at DESC`,
      [pubkey]
    );
    return result.rows;
  } finally {
    if (client) client.release();
  }
}

export async function expirePastDueManualInvoices(): Promise<number> {
  let client;
  try {
    client = await getDbPool().connect();
    const result = await client.query(
      `UPDATE pro_manual_invoices
       SET status = 'expired', updated_at = now()
       WHERE status = 'pending' AND due_at < now()`
    );
    return result.rowCount ?? 0;
  } finally {
    if (client) client.release();
  }
}

// ---------------------------------------------------------------------------
// One-time settings / flags
// ---------------------------------------------------------------------------

export async function getProSetting(key: string): Promise<string | null> {
  let client;
  try {
    client = await getDbPool().connect();
    const result = await client.query(
      `SELECT value FROM pro_settings WHERE key = $1`,
      [key]
    );
    return result.rows[0]?.value ?? null;
  } finally {
    if (client) client.release();
  }
}

export async function setProSetting(key: string, value: string): Promise<void> {
  let client;
  try {
    client = await getDbPool().connect();
    await client.query(
      `INSERT INTO pro_settings (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, value]
    );
  } finally {
    if (client) client.release();
  }
}

/**
 * Distinct seller pubkeys that already run a stall — sellers with at least one
 * product listing or a shop profile. Used by the one-time trial backfill.
 */
export async function listExistingStallPubkeys(): Promise<string[]> {
  let client;
  try {
    client = await getDbPool().connect();
    const result = await client.query(
      `SELECT DISTINCT pubkey FROM (
         SELECT pubkey FROM product_events
         UNION
         SELECT pubkey FROM profile_events WHERE kind = 30019
       ) AS stalls
       WHERE pubkey IS NOT NULL AND pubkey <> ''`
    );
    return result.rows.map((r: { pubkey: string }) => r.pubkey);
  } finally {
    if (client) client.release();
  }
}
