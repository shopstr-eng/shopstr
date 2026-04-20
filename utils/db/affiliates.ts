import { randomBytes } from "crypto";
import { getDbPool } from "@/utils/db/db-service";

export type RebateType = "percent" | "fixed";
export type DiscountType = "percent" | "fixed";
export type PayoutSchedule = "every_sale" | "daily" | "weekly" | "monthly";
export type ReferralStatus = "pending" | "payable" | "paid" | "cancelled";
export type PaymentRail = "stripe" | "bitcoin";
export type PayoutMethod = "stripe" | "lightning" | "manual";

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
  created_at: Date;
  updated_at: Date;
}

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

export async function deleteAffiliate(
  id: number,
  sellerPubkey: string
): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query(
      `DELETE FROM affiliates WHERE id = $1 AND seller_pubkey = $2`,
      [id, sellerPubkey]
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

export async function incrementAffiliateCodeUsage(
  codeId: number
): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE affiliate_codes SET times_used = times_used + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [codeId]
    );
  } finally {
    client.release();
  }
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
    const result = await client.query(
      `INSERT INTO affiliate_referrals
         (affiliate_id, code_id, seller_pubkey, order_id, payment_rail,
          gross_subtotal_smallest, buyer_discount_smallest, rebate_smallest,
          currency, status, realtime_transfer_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (order_id, code_id) DO UPDATE SET
         status = EXCLUDED.status,
         realtime_transfer_ref = COALESCE(EXCLUDED.realtime_transfer_ref, affiliate_referrals.realtime_transfer_ref),
         updated_at = CURRENT_TIMESTAMP
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
    return result.rows[0] as AffiliateReferral;
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
 * to status='payable' so the scheduler picks them up.
 */
export async function markReferralsPayableBySchedule(
  schedule: PayoutSchedule
): Promise<number> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const r = await client.query(
      `UPDATE affiliate_referrals AS r
         SET status = 'payable', updated_at = CURRENT_TIMESTAMP
       FROM affiliate_codes c
       WHERE r.code_id = c.id
         AND c.payout_schedule = $1
         AND r.status = 'pending'`,
      [schedule]
    );
    return r.rowCount ?? 0;
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
