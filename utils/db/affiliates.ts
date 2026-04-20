import { randomBytes } from "crypto";
import { getDbPool } from "@/utils/db/db-service";

export type RebateType = "percent" | "fixed";
export type DiscountType = "percent" | "fixed";
// Real-time payouts were removed so refund clawbacks are deterministic.
// All rebates accrue and settle in batch on the chosen cadence.
export type PayoutSchedule = "weekly" | "biweekly" | "monthly";
export type ReferralStatus =
  | "pending"
  | "payable"
  | "paid"
  | "cancelled"
  | "refunded";
export type PaymentRail = "stripe" | "bitcoin";
export type PayoutMethod = "stripe" | "lightning" | "manual";

// Minimum age (days) a referral must reach before it becomes 'payable'. This
// gives buyers a refund window and keeps clawbacks simple — once a referral
// is promoted past this it can be paid by the cron and any later refund
// flips the row to 'refunded' for manual reconciliation.
export const PAYOUT_HOLD_DAYS: Record<PayoutSchedule, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export interface Affiliate {
  id: number;
  seller_pubkey: string;
  name: string;
  email: string | null;
  affiliate_pubkey: string | null;
  invite_token: string;
  invite_claimed_at: Date | null;
  lightning_address: string | null;
  stripe_account_id: string | null;
  notes: string | null;
  payouts_enabled: boolean;
  payout_failure_count: number;
  last_payout_failure_at: Date | null;
  last_payout_failure_reason: string | null;
  email_notifications_enabled: boolean;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_onboarding_complete: boolean;
  created_at: Date;
  updated_at: Date;
}

// Hard cap on how many consecutive automated payout attempts we make for a
// single affiliate before flipping `payouts_enabled` off. After that the
// seller must investigate (e.g. wrong lightning address) and re-enable.
export const MAX_PAYOUT_FAILURES = 5;

export interface AffiliateCode {
  id: number;
  affiliate_id: number;
  seller_pubkey: string;
  code: string;
  rebate_type: RebateType;
  rebate_value: number;
  buyer_discount_type: DiscountType;
  buyer_discount_value: number;
  currency: string | null;
  payout_schedule: PayoutSchedule;
  expiration: number | null;
  max_uses: number | null;
  times_used: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AffiliateReferral {
  id: number;
  affiliate_id: number;
  code_id: number;
  seller_pubkey: string;
  order_id: string;
  payment_rail: PaymentRail;
  gross_subtotal_smallest: string;
  buyer_discount_smallest: string;
  rebate_smallest: string;
  currency: string;
  status: ReferralStatus;
  payout_id: number | null;
  realtime_transfer_ref: string | null;
  created_at: Date;
  updated_at: Date;
}

function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

// ---------------------------------------------------------------------------
// Affiliates
// ---------------------------------------------------------------------------

export async function createAffiliate(params: {
  sellerPubkey: string;
  name: string;
  email?: string | null;
  lightningAddress?: string | null;
  stripeAccountId?: string | null;
  notes?: string | null;
}): Promise<Affiliate> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO affiliates
         (seller_pubkey, name, email, lightning_address, stripe_account_id, notes, invite_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        params.sellerPubkey,
        params.name,
        params.email ?? null,
        params.lightningAddress ?? null,
        params.stripeAccountId ?? null,
        params.notes ?? null,
        generateInviteToken(),
      ]
    );
    return result.rows[0] as Affiliate;
  } finally {
    client.release();
  }
}

export async function listAffiliatesBySeller(
  sellerPubkey: string
): Promise<Affiliate[]> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM affiliates WHERE seller_pubkey = $1 ORDER BY created_at DESC`,
      [sellerPubkey]
    );
    return result.rows as Affiliate[];
  } finally {
    client.release();
  }
}

export async function getAffiliateById(id: number): Promise<Affiliate | null> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM affiliates WHERE id = $1`,
      [id]
    );
    return (result.rows[0] as Affiliate) ?? null;
  } finally {
    client.release();
  }
}

export async function getAffiliateByInviteToken(
  token: string
): Promise<Affiliate | null> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM affiliates WHERE invite_token = $1`,
      [token]
    );
    return (result.rows[0] as Affiliate) ?? null;
  } finally {
    client.release();
  }
}

export async function updateAffiliate(
  id: number,
  sellerPubkey: string,
  patch: Partial<{
    name: string;
    email: string | null;
    lightningAddress: string | null;
    stripeAccountId: string | null;
    notes: string | null;
  }>
): Promise<Affiliate | null> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.name !== undefined) {
      fields.push(`name = $${i++}`);
      values.push(patch.name);
    }
    if (patch.email !== undefined) {
      fields.push(`email = $${i++}`);
      values.push(patch.email);
    }
    if (patch.lightningAddress !== undefined) {
      fields.push(`lightning_address = $${i++}`);
      values.push(patch.lightningAddress);
    }
    if (patch.stripeAccountId !== undefined) {
      fields.push(`stripe_account_id = $${i++}`);
      values.push(patch.stripeAccountId);
    }
    if (patch.notes !== undefined) {
      fields.push(`notes = $${i++}`);
      values.push(patch.notes);
    }
    if (fields.length === 0) return getAffiliateById(id);
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, sellerPubkey);
    const result = await client.query(
      `UPDATE affiliates SET ${fields.join(", ")}
         WHERE id = $${i++} AND seller_pubkey = $${i++}
         RETURNING *`,
      values
    );
    return (result.rows[0] as Affiliate) ?? null;
  } finally {
    client.release();
  }
}

export async function updateAffiliatePayoutMethod(
  inviteToken: string,
  patch: {
    affiliatePubkey?: string | null;
    lightningAddress?: string | null;
    stripeAccountId?: string | null;
  }
): Promise<Affiliate | null> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    // Block a seller from claiming their own affiliate invite — that would
    // let them rebate themselves on every sale.
    if (patch.affiliatePubkey) {
      const owner = await client.query(
        `SELECT seller_pubkey FROM affiliates WHERE invite_token = $1`,
        [inviteToken]
      );
      const sellerPubkey = owner.rows[0]?.seller_pubkey as string | undefined;
      if (sellerPubkey && isSelfReferral(sellerPubkey, patch.affiliatePubkey)) {
        throw new Error("Sellers cannot claim their own affiliate invite");
      }
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.affiliatePubkey !== undefined) {
      fields.push(`affiliate_pubkey = $${i++}`);
      values.push(patch.affiliatePubkey);
    }
    if (patch.lightningAddress !== undefined) {
      fields.push(`lightning_address = $${i++}`);
      values.push(patch.lightningAddress);
    }
    if (patch.stripeAccountId !== undefined) {
      fields.push(`stripe_account_id = $${i++}`);
      values.push(patch.stripeAccountId);
    }
    fields.push(
      `invite_claimed_at = COALESCE(invite_claimed_at, CURRENT_TIMESTAMP)`
    );
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(inviteToken);
    const result = await client.query(
      `UPDATE affiliates SET ${fields.join(", ")}
         WHERE invite_token = $${i++}
         RETURNING *`,
      values
    );
    return (result.rows[0] as Affiliate) ?? null;
  } finally {
    client.release();
  }
}

/**
 * Delete an affiliate. Refuses when the affiliate has any unsettled balance
 * (pending or payable referrals) unless `force` is set, in which case those
 * referrals are first cancelled. This guards the seller from accidentally
 * deleting an affiliate they still owe money to.
 */
export async function deleteAffiliate(
  id: number,
  sellerPubkey: string,
  opts: { force?: boolean } = {}
): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const bal = await client.query(
      `SELECT COALESCE(SUM(rebate_smallest), 0)::text AS owed
         FROM affiliate_referrals
         WHERE affiliate_id = $1 AND seller_pubkey = $2
           AND status IN ('pending', 'payable')`,
      [id, sellerPubkey]
    );
    const owed = Number(bal.rows[0]?.owed ?? 0);
    if (owed > 0 && !opts.force) {
      await client.query("ROLLBACK");
      throw new Error(
        `Affiliate has an unsettled balance (${owed}). Pay it out or pass force=true to cancel and delete.`
      );
    }
    if (opts.force && owed > 0) {
      await client.query(
        `UPDATE affiliate_referrals
           SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
         WHERE affiliate_id = $1 AND seller_pubkey = $2
           AND status IN ('pending', 'payable')`,
        [id, sellerPubkey]
      );
    }
    await client.query(
      `DELETE FROM affiliates WHERE id = $1 AND seller_pubkey = $2`,
      [id, sellerPubkey]
    );
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Rotate the affiliate's invite token (e.g. when the previous link leaks).
 * Returns the new token. The caller has already authenticated as the seller.
 */
export async function regenerateInviteToken(
  id: number,
  sellerPubkey: string
): Promise<string | null> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const newToken = generateInviteToken();
    const r = await client.query(
      `UPDATE affiliates
         SET invite_token = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND seller_pubkey = $3
       RETURNING invite_token`,
      [newToken, id, sellerPubkey]
    );
    return (r.rows[0]?.invite_token as string) ?? null;
  } finally {
    client.release();
  }
}

/**
 * Toggle payouts_enabled on an affiliate. Used by the seller to re-enable
 * auto-payouts after a failure has been investigated.
 */
export async function setAffiliatePayoutsEnabled(
  id: number,
  sellerPubkey: string,
  enabled: boolean
): Promise<Affiliate | null> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const r = await client.query(
      `UPDATE affiliates
         SET payouts_enabled = $1,
             payout_failure_count = CASE WHEN $1 THEN 0 ELSE payout_failure_count END,
             last_payout_failure_reason = CASE WHEN $1 THEN NULL ELSE last_payout_failure_reason END,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND seller_pubkey = $3
       RETURNING *`,
      [enabled, id, sellerPubkey]
    );
    return (r.rows[0] as Affiliate) ?? null;
  } finally {
    client.release();
  }
}

/**
 * Record a failed payout attempt; flips `payouts_enabled` off once the
 * cumulative failure count crosses MAX_PAYOUT_FAILURES.
 */
export async function recordPayoutFailure(
  affiliateId: number,
  reason: string
): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE affiliates
         SET payout_failure_count = payout_failure_count + 1,
             last_payout_failure_at = CURRENT_TIMESTAMP,
             last_payout_failure_reason = $2,
             payouts_enabled = CASE
               WHEN payout_failure_count + 1 >= $3 THEN FALSE
               ELSE payouts_enabled
             END,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [affiliateId, reason.slice(0, 500), MAX_PAYOUT_FAILURES]
    );
  } finally {
    client.release();
  }
}

export async function clearPayoutFailure(affiliateId: number): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE affiliates
         SET payout_failure_count = 0,
             last_payout_failure_reason = NULL,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [affiliateId]
    );
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Affiliate codes
// ---------------------------------------------------------------------------

export async function createAffiliateCode(params: {
  affiliateId: number;
  sellerPubkey: string;
  code: string;
  rebateType: RebateType;
  rebateValue: number;
  buyerDiscountType: DiscountType;
  buyerDiscountValue: number;
  currency?: string | null;
  payoutSchedule: PayoutSchedule;
  expiration?: number | null;
  maxUses?: number | null;
}): Promise<AffiliateCode> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO affiliate_codes
         (affiliate_id, seller_pubkey, code, rebate_type, rebate_value,
          buyer_discount_type, buyer_discount_value, currency,
          payout_schedule, expiration, max_uses)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        params.affiliateId,
        params.sellerPubkey,
        params.code,
        params.rebateType,
        params.rebateValue,
        params.buyerDiscountType,
        params.buyerDiscountValue,
        params.currency ?? null,
        params.payoutSchedule,
        params.expiration ?? null,
        params.maxUses ?? null,
      ]
    );
    return result.rows[0] as AffiliateCode;
  } finally {
    client.release();
  }
}

export async function listAffiliateCodesBySeller(
  sellerPubkey: string
): Promise<(AffiliateCode & { affiliate_name: string })[]> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT c.*, a.name AS affiliate_name
         FROM affiliate_codes c
         JOIN affiliates a ON a.id = c.affiliate_id
         WHERE c.seller_pubkey = $1
         ORDER BY c.created_at DESC`,
      [sellerPubkey]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export async function listAffiliateCodesByAffiliate(
  affiliateId: number
): Promise<AffiliateCode[]> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM affiliate_codes WHERE affiliate_id = $1 ORDER BY created_at DESC`,
      [affiliateId]
    );
    return result.rows as AffiliateCode[];
  } finally {
    client.release();
  }
}

export async function updateAffiliateCode(
  id: number,
  sellerPubkey: string,
  patch: Partial<{
    rebateType: RebateType;
    rebateValue: number;
    buyerDiscountType: DiscountType;
    buyerDiscountValue: number;
    currency: string | null;
    payoutSchedule: PayoutSchedule;
    expiration: number | null;
    maxUses: number | null;
    isActive: boolean;
  }>
): Promise<AffiliateCode | null> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    const map: Array<[string, keyof typeof patch]> = [
      ["rebate_type", "rebateType"],
      ["rebate_value", "rebateValue"],
      ["buyer_discount_type", "buyerDiscountType"],
      ["buyer_discount_value", "buyerDiscountValue"],
      ["currency", "currency"],
      ["payout_schedule", "payoutSchedule"],
      ["expiration", "expiration"],
      ["max_uses", "maxUses"],
      ["is_active", "isActive"],
    ];
    for (const [col, key] of map) {
      const v = patch[key];
      if (v !== undefined) {
        fields.push(`${col} = $${i++}`);
        values.push(v);
      }
    }
    if (fields.length === 0) {
      const r = await client.query(
        `SELECT * FROM affiliate_codes WHERE id = $1 AND seller_pubkey = $2`,
        [id, sellerPubkey]
      );
      return (r.rows[0] as AffiliateCode) ?? null;
    }
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id, sellerPubkey);
    const result = await client.query(
      `UPDATE affiliate_codes SET ${fields.join(", ")}
         WHERE id = $${i++} AND seller_pubkey = $${i++}
         RETURNING *`,
      values
    );
    return (result.rows[0] as AffiliateCode) ?? null;
  } finally {
    client.release();
  }
}

export async function deleteAffiliateCode(
  id: number,
  sellerPubkey: string
): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query(
      `DELETE FROM affiliate_codes WHERE id = $1 AND seller_pubkey = $2`,
      [id, sellerPubkey]
    );
  } finally {
    client.release();
  }
}

export async function lookupAffiliateCode(
  sellerPubkey: string,
  code: string
): Promise<(AffiliateCode & { affiliate: Affiliate }) | null> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT c.*, row_to_json(a.*) AS affiliate
         FROM affiliate_codes c
         JOIN affiliates a ON a.id = c.affiliate_id
         WHERE c.seller_pubkey = $1 AND UPPER(c.code) = UPPER($2)`,
      [sellerPubkey, code]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function isAffiliateCodeValid(c: AffiliateCode): Promise<boolean> {
  if (!c.is_active) return false;
  if (c.expiration && Date.now() / 1000 > c.expiration) return false;
  if (c.max_uses !== null && c.times_used >= c.max_uses) return false;
  return true;
}

/**
 * Atomic max_uses enforcement: only increments if there is still room under
 * `max_uses` (or if `max_uses` is null). Returns true on success so the
 * caller can roll back / refuse the referral when the cap is reached.
 */
export async function incrementAffiliateCodeUsage(
  codeId: number
): Promise<boolean> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const r = await client.query(
      `UPDATE affiliate_codes
         SET times_used = times_used + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND is_active = TRUE
         AND (max_uses IS NULL OR times_used < max_uses)
       RETURNING id`,
      [codeId]
    );
    return (r.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

/**
 * Returns true if the affiliate is the seller themselves — used to block
 * obvious self-referral abuse at create / claim / record time.
 */
export function isSelfReferral(
  sellerPubkey: string,
  affiliatePubkey: string | null | undefined
): boolean {
  if (!affiliatePubkey) return false;
  return affiliatePubkey.toLowerCase() === sellerPubkey.toLowerCase();
}

// ---------------------------------------------------------------------------
// Discount + rebate math (works in smallest units, "cents" or sats)
// ---------------------------------------------------------------------------

/**
 * Compute the buyer discount in smallest units. Caps the discount strictly
 * below the gross so the buyer never pays zero / negative.
 */
export function computeBuyerDiscountSmallest(
  grossSmallest: number,
  type: DiscountType,
  value: number
): number {
  if (!Number.isFinite(grossSmallest) || grossSmallest <= 0) return 0;
  if (!Number.isFinite(value) || value <= 0) return 0;
  let cut = 0;
  if (type === "percent") {
    cut = Math.floor((grossSmallest * Math.min(value, 100)) / 100);
  } else {
    // Fixed values are stored in major units (e.g. dollars); convert to cents.
    cut = Math.floor(value * 100);
  }
  if (cut >= grossSmallest) return grossSmallest - 1;
  return Math.max(cut, 0);
}

/**
 * Compute the affiliate rebate in smallest units, applied to the *net*
 * subtotal (after the buyer discount) so the rebate scales with what the
 * seller actually receives.
 */
export function computeRebateSmallest(
  netSmallest: number,
  type: RebateType,
  value: number
): number {
  if (!Number.isFinite(netSmallest) || netSmallest <= 0) return 0;
  if (!Number.isFinite(value) || value <= 0) return 0;
  let cut = 0;
  if (type === "percent") {
    cut = Math.floor((netSmallest * Math.min(value, 100)) / 100);
  } else {
    cut = Math.floor(value * 100);
  }
  if (cut >= netSmallest) return netSmallest;
  return Math.max(cut, 0);
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

export async function recordReferral(params: {
  affiliateId: number;
  codeId: number;
  sellerPubkey: string;
  orderId: string;
  paymentRail: PaymentRail;
  grossSubtotalSmallest: number;
  buyerDiscountSmallest: number;
  rebateSmallest: number;
  currency: string;
  initialStatus?: ReferralStatus;
  realtimeTransferRef?: string | null;
}): Promise<AffiliateReferral> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock the code row so concurrent callers see a consistent times_used.
    const codeRes = await client.query(
      `SELECT is_active, max_uses, times_used FROM affiliate_codes
         WHERE id = $1 FOR UPDATE`,
      [params.codeId]
    );
    if (codeRes.rowCount === 0 || !codeRes.rows[0].is_active) {
      throw new Error("Affiliate code is inactive or missing");
    }
    const { max_uses, times_used } = codeRes.rows[0];
    // Idempotency-safe insert: DO NOTHING on conflict so a late call from
    // the browser cannot overwrite the row written by the Stripe webhook.
    const insRes = await client.query(
      `INSERT INTO affiliate_referrals
         (affiliate_id, code_id, seller_pubkey, order_id, payment_rail,
          gross_subtotal_smallest, buyer_discount_smallest, rebate_smallest,
          currency, status, realtime_transfer_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (order_id, code_id) DO NOTHING
       RETURNING *`,
      [
        params.affiliateId,
        params.codeId,
        params.sellerPubkey,
        params.orderId,
        params.paymentRail,
        params.grossSubtotalSmallest,
        params.buyerDiscountSmallest,
        params.rebateSmallest,
        params.currency,
        params.initialStatus ?? "pending",
        params.realtimeTransferRef ?? null,
      ]
    );
    let referral: AffiliateReferral;
    let inserted = false;
    if ((insRes.rowCount ?? 0) > 0) {
      // Enforce max_uses inside the same transaction so two concurrent
      // referrals can't both fit under the cap.
      if (max_uses !== null && times_used >= max_uses) {
        await client.query("ROLLBACK");
        throw new Error("Affiliate code is no longer available");
      }
      await client.query(
        `UPDATE affiliate_codes
           SET times_used = times_used + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [params.codeId]
      );
      referral = insRes.rows[0] as AffiliateReferral;
      inserted = true;
    } else {
      const sel = await client.query(
        `SELECT * FROM affiliate_referrals
           WHERE order_id = $1 AND code_id = $2`,
        [params.orderId, params.codeId]
      );
      referral = sel.rows[0] as AffiliateReferral;
    }
    await client.query("COMMIT");
    // The `inserted` flag is exposed via a non-enumerable property so the
    // existing return type stays a plain referral row for back-compat.
    Object.defineProperty(referral, "_inserted", {
      value: inserted,
      enumerable: false,
    });
    return referral;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export async function listReferralsBySeller(
  sellerPubkey: string,
  status?: ReferralStatus
): Promise<AffiliateReferral[]> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    if (status) {
      const r = await client.query(
        `SELECT * FROM affiliate_referrals WHERE seller_pubkey = $1 AND status = $2 ORDER BY created_at DESC`,
        [sellerPubkey, status]
      );
      return r.rows as AffiliateReferral[];
    }
    const r = await client.query(
      `SELECT * FROM affiliate_referrals WHERE seller_pubkey = $1 ORDER BY created_at DESC`,
      [sellerPubkey]
    );
    return r.rows as AffiliateReferral[];
  } finally {
    client.release();
  }
}

export interface AffiliateBalance {
  affiliate_id: number;
  affiliate_name: string;
  currency: string;
  pending_smallest: string; // pending or payable
  payable_smallest: string;
  paid_smallest: string;
  referral_count: number;
}

export async function getAffiliateBalances(
  sellerPubkey: string
): Promise<AffiliateBalance[]> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT
         r.affiliate_id,
         a.name AS affiliate_name,
         r.currency,
         COALESCE(SUM(CASE WHEN r.status IN ('pending','payable') THEN r.rebate_smallest ELSE 0 END), 0) AS pending_smallest,
         COALESCE(SUM(CASE WHEN r.status = 'payable' THEN r.rebate_smallest ELSE 0 END), 0) AS payable_smallest,
         COALESCE(SUM(CASE WHEN r.status = 'paid' THEN r.rebate_smallest ELSE 0 END), 0) AS paid_smallest,
         COUNT(*)::int AS referral_count
       FROM affiliate_referrals r
       JOIN affiliates a ON a.id = r.affiliate_id
       WHERE r.seller_pubkey = $1
       GROUP BY r.affiliate_id, a.name, r.currency
       ORDER BY a.name`,
      [sellerPubkey]
    );
    return r.rows as AffiliateBalance[];
  } finally {
    client.release();
  }
}

/**
 * Move all eligible referrals for an affiliate (matching schedule + currency)
 * to status='payable' so the scheduler picks them up. Referrals are only
 * promoted once they are older than the schedule's hold window — this gives
 * buyers a refund window before money leaves the platform.
 */
export async function markReferralsPayableBySchedule(
  schedule: PayoutSchedule
): Promise<number> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const holdDays = PAYOUT_HOLD_DAYS[schedule];
    const r = await client.query(
      `UPDATE affiliate_referrals AS r
         SET status = 'payable', updated_at = CURRENT_TIMESTAMP
       FROM affiliate_codes c
       WHERE r.code_id = c.id
         AND c.payout_schedule = $1
         AND r.status = 'pending'
         AND r.created_at <= NOW() - ($2::int || ' days')::interval`,
      [schedule, holdDays]
    );
    return r.rowCount ?? 0;
  } finally {
    client.release();
  }
}

/**
 * Pure helper: compute the refund ratio applied to a charge. Clamped 0..1.
 * Exposed for unit tests.
 */
export function computeRefundRatio(
  originalGrossSmallest: number,
  refundedSmallest: number
): number {
  if (!Number.isFinite(originalGrossSmallest) || originalGrossSmallest <= 0) {
    return 0;
  }
  if (!Number.isFinite(refundedSmallest) || refundedSmallest <= 0) return 0;
  return Math.min(1, refundedSmallest / originalGrossSmallest);
}

/**
 * Pure helper: scale an original rebate down by the refund ratio. Returns the
 * portion of the rebate that has been clawed back. Exposed for unit tests.
 */
export function computeClawbackSmallest(
  originalRebateSmallest: number,
  refundRatio: number
): number {
  if (!Number.isFinite(originalRebateSmallest) || originalRebateSmallest <= 0) {
    return 0;
  }
  const r = Math.max(0, Math.min(1, refundRatio));
  return Math.floor(originalRebateSmallest * r);
}

/**
 * Refund/clawback: cancel or scale-down pending/payable referrals (no money
 * has moved yet) and mark already-paid referrals as 'refunded' so the seller
 * can reconcile manually with the affiliate. Used by the Stripe
 * `charge.refunded` webhook.
 *
 * Partial refund handling:
 *  - When `originalGrossSmallest` is provided we compute a refund ratio and
 *    scale each referral's rebate proportionally instead of full-cancelling.
 *  - For pending/payable rows: rebate is reduced by the clawback amount; if
 *    the row is fully refunded the status flips to 'cancelled', otherwise it
 *    remains pending/payable with the smaller rebate.
 *  - For already-paid rows: we record the proportional clawback in
 *    `refunded_smallest` for manual reconciliation. Status only flips to
 *    'refunded' on a full refund.
 *
 * When `originalGrossSmallest` is omitted we fall back to the legacy
 * full-refund behavior for back-compat.
 */
export async function reverseReferralsForOrder(params: {
  orderId: string;
  sellerPubkey: string;
  originalGrossSmallest?: number;
  refundedSmallest?: number;
  refundEventRef?: string | null;
}): Promise<{
  cancelled: number;
  refunded: number;
  partial: number;
  totalClawbackSmallest: number;
}> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const refunded = params.refundedSmallest ?? 0;
    const gross = params.originalGrossSmallest ?? 0;
    const ratio =
      gross > 0 ? computeRefundRatio(gross, refunded) : refunded > 0 ? 1 : 1;
    const isFull = ratio >= 1 || gross <= 0;

    // Lock + read all candidate rows so we can decide row-by-row.
    const rowsRes = await client.query(
      `SELECT id, status, rebate_smallest, refunded_smallest
         FROM affiliate_referrals
         WHERE order_id = $1 AND seller_pubkey = $2
           AND status IN ('pending', 'payable', 'paid')
         FOR UPDATE`,
      [params.orderId, params.sellerPubkey]
    );

    let cancelled = 0;
    let refundedCount = 0;
    let partial = 0;
    let totalClawback = 0;

    for (const row of rowsRes.rows) {
      const origRebate = Number(row.rebate_smallest);
      const clawback = isFull
        ? origRebate
        : computeClawbackSmallest(origRebate, ratio);
      totalClawback += clawback;

      if (row.status === "paid") {
        if (isFull) {
          await client.query(
            `UPDATE affiliate_referrals
               SET status = 'refunded',
                   refunded_smallest = $2,
                   refund_event_ref = $3,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [row.id, clawback, params.refundEventRef ?? null]
          );
          refundedCount += 1;
        } else {
          // Partial refund of an already-paid referral. Leave status='paid'
          // (money already moved) but record the clawback so the seller can
          // reconcile out-of-band with the affiliate.
          await client.query(
            `UPDATE affiliate_referrals
               SET refunded_smallest = refunded_smallest + $2,
                   refund_event_ref = $3,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [row.id, clawback, params.refundEventRef ?? null]
          );
          partial += 1;
        }
        continue;
      }

      // pending / payable
      if (isFull || clawback >= origRebate) {
        await client.query(
          `UPDATE affiliate_referrals
             SET status = 'cancelled',
                 refunded_smallest = $2,
                 refund_event_ref = $3,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [
            row.id,
            isFull ? origRebate : clawback,
            params.refundEventRef ?? null,
          ]
        );
        cancelled += 1;
      } else {
        // Partial: reduce the rebate so only the unrefunded slice is paid.
        const newRebate = Math.max(origRebate - clawback, 0);
        await client.query(
          `UPDATE affiliate_referrals
             SET rebate_smallest = $2,
                 refunded_smallest = refunded_smallest + $3,
                 refund_event_ref = $4,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [row.id, newRebate, clawback, params.refundEventRef ?? null]
        );
        partial += 1;
      }
    }

    await client.query("COMMIT");
    return {
      cancelled,
      refunded: refundedCount,
      partial,
      totalClawbackSmallest: totalClawback,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Acquire a session-scoped Postgres advisory lock so concurrent cron
 * invocations of `process-payouts` for the same schedule don't double-pay.
 * The caller must release the lock by ending the session (we use a fresh
 * client and release it). Returns null if the lock could not be acquired.
 */
export async function tryAdvisoryLock(
  key: number
): Promise<{ release: () => Promise<void> } | null> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const r = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [
      key,
    ]);
    if (!r.rows[0]?.ok) {
      client.release();
      return null;
    }
    return {
      release: async () => {
        try {
          await client.query("SELECT pg_advisory_unlock($1)", [key]);
        } finally {
          client.release();
        }
      },
    };
  } catch (err) {
    client.release();
    throw err;
  }
}

// Thin re-export so that affiliate code paths don't have to know about the
// notification-emails table directly. We import lazily to avoid creating an
// import cycle through db-service.
export async function getSellerEmailForPubkey(
  pubkey: string
): Promise<string | null> {
  const mod = await import("@/utils/db/db-service");
  return mod.getSellerNotificationEmail(pubkey);
}

// ---------------------------------------------------------------------------
// Click-through tracking
// ---------------------------------------------------------------------------

/**
 * Record a single affiliate-link impression. Called by `/api/affiliates/
 * record-click` when the front-end ref-tracker first sees `?ref=CODE`. We
 * intentionally don't store IP or user-agent fingerprints; the seller only
 * cares about clicks-vs-conversions, not who clicked.
 */
export async function recordAffiliateClick(params: {
  sellerPubkey: string;
  code: string;
  landingPath?: string | null;
  refererHost?: string | null;
}): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO affiliate_clicks
         (seller_pubkey, code, landing_path, referer_host)
       VALUES ($1, $2, $3, $4)`,
      [
        params.sellerPubkey,
        params.code,
        params.landingPath ?? null,
        params.refererHost ?? null,
      ]
    );
  } finally {
    client.release();
  }
}

export interface AffiliateClickAggregate {
  affiliate_id: number | null;
  affiliate_name: string | null;
  code: string;
  clicks: number;
  conversions: number;
  conversion_rate: number;
}

/**
 * Per-code click + conversion aggregates for a single seller in a window.
 * Conversions come from non-cancelled referrals so refunded ones still count
 * as a real conversion event (the buyer did complete checkout).
 */
export async function getAffiliateClickStats(
  sellerPubkey: string,
  sinceDays = 30
): Promise<AffiliateClickAggregate[]> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const r = await client.query(
      `WITH click_agg AS (
         SELECT UPPER(code) AS code_u, COUNT(*)::int AS clicks
           FROM affiliate_clicks
           WHERE seller_pubkey = $1
             AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
           GROUP BY UPPER(code)
       ),
       conv_agg AS (
         SELECT UPPER(c.code) AS code_u, c.id AS code_id, c.affiliate_id,
                a.name AS affiliate_name,
                COUNT(r.id) FILTER (WHERE r.status <> 'cancelled')::int AS conversions
           FROM affiliate_codes c
           JOIN affiliates a ON a.id = c.affiliate_id
           LEFT JOIN affiliate_referrals r ON r.code_id = c.id
            AND r.created_at >= NOW() - ($2::int * INTERVAL '1 day')
           WHERE c.seller_pubkey = $1
           GROUP BY UPPER(c.code), c.id, c.affiliate_id, a.name
       )
       SELECT COALESCE(conv.affiliate_id, NULL) AS affiliate_id,
              COALESCE(conv.affiliate_name, NULL) AS affiliate_name,
              COALESCE(conv.code_u, click.code_u) AS code,
              COALESCE(click.clicks, 0)::int AS clicks,
              COALESCE(conv.conversions, 0)::int AS conversions,
              CASE WHEN COALESCE(click.clicks, 0) > 0
                   THEN COALESCE(conv.conversions, 0)::float / click.clicks
                   ELSE 0 END AS conversion_rate
         FROM click_agg click
         FULL OUTER JOIN conv_agg conv ON click.code_u = conv.code_u
         ORDER BY clicks DESC, conversions DESC`,
      [sellerPubkey, sinceDays]
    );
    return r.rows as AffiliateClickAggregate[];
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Email-preference + Stripe-account-state helpers
// ---------------------------------------------------------------------------

/** Disable transactional payout/pause emails for a single affiliate. */
export async function setAffiliateEmailNotifications(
  inviteToken: string,
  enabled: boolean
): Promise<Affiliate | null> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const r = await client.query(
      `UPDATE affiliates
          SET email_notifications_enabled = $2,
              updated_at = CURRENT_TIMESTAMP
        WHERE invite_token = $1
        RETURNING *`,
      [inviteToken, enabled]
    );
    return (r.rows[0] as Affiliate | undefined) ?? null;
  } finally {
    client.release();
  }
}

/**
 * Clear cached Stripe-Connect state after `account.application.deauthorized`.
 * The connected account is no longer transferable, so we flip every stripe_*
 * flag to false. The `stripe_account_id` is intentionally retained for audit;
 * process-payouts already short-circuits when stripe_payouts_enabled=false.
 * Returns the affiliate id we matched (or null when no row owns this account).
 */
export async function markAffiliateStripeDeauthorized(
  stripeAccountId: string
): Promise<number | null> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const r = await client.query(
      `UPDATE affiliates
          SET stripe_charges_enabled = FALSE,
              stripe_payouts_enabled = FALSE,
              stripe_onboarding_complete = FALSE,
              updated_at = CURRENT_TIMESTAMP
        WHERE stripe_account_id = $1
        RETURNING id`,
      [stripeAccountId]
    );
    return (r.rows[0]?.id as number | undefined) ?? null;
  } finally {
    client.release();
  }
}

/**
 * Sync the cached Stripe-Connect onboarding flags after we receive
 * `account.updated`. Returns the affiliate id we matched (or null).
 */
export async function syncAffiliateStripeAccountState(params: {
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}): Promise<number | null> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const r = await client.query(
      `UPDATE affiliates
          SET stripe_charges_enabled = $2,
              stripe_payouts_enabled = $3,
              stripe_onboarding_complete = $4,
              updated_at = CURRENT_TIMESTAMP
        WHERE stripe_account_id = $1
        RETURNING id`,
      [
        params.stripeAccountId,
        params.chargesEnabled,
        params.payoutsEnabled,
        params.detailsSubmitted &&
          params.chargesEnabled &&
          params.payoutsEnabled,
      ]
    );
    return (r.rows[0]?.id as number | undefined) ?? null;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Reporting helpers (year-to-date totals, per-token balances)
// ---------------------------------------------------------------------------

export interface YtdPayoutTotal {
  affiliate_id: number;
  affiliate_name: string;
  email: string | null;
  currency: string;
  total_smallest: string;
  payout_count: number;
}

/**
 * Year-to-date paid-out totals per affiliate per currency, scoped to a single
 * seller. Useful for US 1099-MISC reporting (the seller is responsible for
 * issuing forms once an affiliate crosses the IRS threshold).
 */
export async function getYearToDatePayouts(
  sellerPubkey: string,
  year: number
): Promise<YtdPayoutTotal[]> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT p.affiliate_id,
              a.name AS affiliate_name,
              a.email AS email,
              p.currency,
              COALESCE(SUM(p.amount_smallest), 0)::text AS total_smallest,
              COUNT(*)::int AS payout_count
         FROM affiliate_payouts p
         JOIN affiliates a ON a.id = p.affiliate_id
         WHERE p.seller_pubkey = $1
           AND p.status = 'paid'
           AND EXTRACT(YEAR FROM p.paid_at) = $2
         GROUP BY p.affiliate_id, a.name, a.email, p.currency
         ORDER BY a.name, p.currency`,
      [sellerPubkey, year]
    );
    return r.rows as YtdPayoutTotal[];
  } finally {
    client.release();
  }
}

export interface AffiliateSelfBalance {
  currency: string;
  pending_smallest: string;
  payable_smallest: string;
  paid_smallest: string;
}

/**
 * Per-currency balances for a single affiliate, looked up by their invite
 * token (used by the affiliate's own self-service dashboard so they don't
 * need a Nostr signature to view their own numbers).
 */
export async function getAffiliateBalancesByToken(
  inviteToken: string
): Promise<{ affiliate: Affiliate; balances: AffiliateSelfBalance[] } | null> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const a = await client.query(
      `SELECT * FROM affiliates WHERE invite_token = $1`,
      [inviteToken]
    );
    const affiliate = a.rows[0] as Affiliate | undefined;
    if (!affiliate) return null;
    const b = await client.query(
      `SELECT currency,
              COALESCE(SUM(CASE WHEN status = 'pending' THEN rebate_smallest ELSE 0 END), 0)::text AS pending_smallest,
              COALESCE(SUM(CASE WHEN status = 'payable' THEN rebate_smallest ELSE 0 END), 0)::text AS payable_smallest,
              COALESCE(SUM(CASE WHEN status = 'paid' THEN rebate_smallest ELSE 0 END), 0)::text AS paid_smallest
         FROM affiliate_referrals
         WHERE affiliate_id = $1
         GROUP BY currency
         ORDER BY currency`,
      [affiliate.id]
    );
    return { affiliate, balances: b.rows as AffiliateSelfBalance[] };
  } finally {
    client.release();
  }
}

/**
 * Recent payouts for a single affiliate (by id), used by the affiliate
 * self-service dashboard.
 */
export async function listRecentPayoutsForAffiliate(
  affiliateId: number,
  limit = 50
): Promise<
  Array<{
    id: number;
    method: PayoutMethod;
    amount_smallest: string;
    currency: string;
    status: string;
    paid_at: Date;
    external_ref: string | null;
  }>
> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT id, method, amount_smallest, currency, status, paid_at, external_ref
         FROM affiliate_payouts
         WHERE affiliate_id = $1
         ORDER BY paid_at DESC
         LIMIT $2`,
      [affiliateId, limit]
    );
    return r.rows;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export async function createPayoutAndSettle(params: {
  affiliateId: number;
  sellerPubkey: string;
  method: PayoutMethod;
  amountSmallest: number;
  currency: string;
  externalRef?: string | null;
  note?: string | null;
  referralIds: number[];
  status?: "paid" | "failed";
}): Promise<{ payoutId: number }> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const insert = await client.query(
      `INSERT INTO affiliate_payouts
         (affiliate_id, seller_pubkey, method, amount_smallest, currency, external_ref, note, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        params.affiliateId,
        params.sellerPubkey,
        params.method,
        params.amountSmallest,
        params.currency,
        params.externalRef ?? null,
        params.note ?? null,
        params.status ?? "paid",
      ]
    );
    const payoutId = insert.rows[0].id as number;
    if (params.referralIds.length > 0 && (params.status ?? "paid") === "paid") {
      await client.query(
        `UPDATE affiliate_referrals
           SET status = 'paid', payout_id = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = ANY($2::int[])`,
        [payoutId, params.referralIds]
      );
    }
    await client.query("COMMIT");
    return { payoutId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listPayoutsBySeller(sellerPubkey: string): Promise<
  Array<{
    id: number;
    affiliate_id: number;
    affiliate_name: string;
    method: PayoutMethod;
    amount_smallest: string;
    currency: string;
    external_ref: string | null;
    note: string | null;
    status: string;
    paid_at: Date;
  }>
> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT p.id, p.affiliate_id, a.name AS affiliate_name, p.method,
              p.amount_smallest, p.currency, p.external_ref, p.note,
              p.status, p.paid_at
         FROM affiliate_payouts p
         JOIN affiliates a ON a.id = p.affiliate_id
         WHERE p.seller_pubkey = $1
         ORDER BY p.paid_at DESC
         LIMIT 200`,
      [sellerPubkey]
    );
    return r.rows;
  } finally {
    client.release();
  }
}

/**
 * Aggregate all payable referrals for a single (affiliate, currency) pair.
 */
export async function getPayableReferralBundle(affiliateId: number): Promise<
  Array<{
    currency: string;
    total_smallest: string;
    referral_ids: number[];
    seller_pubkey: string;
  }>
> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT currency, seller_pubkey,
              COALESCE(SUM(rebate_smallest), 0)::text AS total_smallest,
              array_agg(id) AS referral_ids
         FROM affiliate_referrals
         WHERE affiliate_id = $1 AND status = 'payable'
         GROUP BY currency, seller_pubkey`,
      [affiliateId]
    );
    return r.rows;
  } finally {
    client.release();
  }
}
