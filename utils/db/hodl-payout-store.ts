import type { PoolClient } from "pg";
import { getInitializedDbPool } from "./db-service";

export type PayoutStatus = "pending" | "paid" | "failed" | "abandoned";
export interface PayoutRecord {
  orderStatus: string;
  sellerNostrPubkey: string;
  amountSats: number;
  status: PayoutStatus;
  invoice: string | null;
  attemptCount: number;
  saveInvoice(invoice: string): Promise<void>;
  recordAttempt(): Promise<void>;
  finish(status: PayoutStatus, reason: string | null): Promise<void>;
}

/** Session lock serializes workers; invoice writes commit BEFORE any send. */
export async function withHodlPayout<T>(
  hash: string,
  work: (record: PayoutRecord | undefined) => Promise<T>
): Promise<T | null> {
  const client = await (await getInitializedDbPool()).connect();
  let locked = false;
  let broken = false;
  const onError = () => {
    broken = true;
  };
  client.on("error", onError);
  const query: PoolClient["query"] = ((...args: any[]) => {
    if (broken) throw new Error("Payout database connection lost");
    return (client.query as any)(...args);
  }) as PoolClient["query"];
  try {
    const lock = await query(
      "SELECT pg_try_advisory_lock(hashtext($1), 606) AS locked",
      [hash]
    );
    locked = lock.rows[0]?.locked === true;
    if (!locked) return null;
    const order = await query(
      "SELECT status, seller_nostr_pubkey, amount_sats FROM hodl_escrow_orders WHERE payment_hash = $1",
      [hash]
    );
    if (!order.rows[0]) return work(undefined);
    await query(
      "INSERT INTO hodl_escrow_payouts (payment_hash) VALUES ($1) ON CONFLICT (payment_hash) DO NOTHING",
      [hash]
    );
    const payout = (
      await query(
        "SELECT status, payout_invoice, attempt_count FROM hodl_escrow_payouts WHERE payment_hash = $1",
        [hash]
      )
    ).rows[0];
    const row = order.rows[0];
    return await work({
      orderStatus: row.status,
      sellerNostrPubkey: row.seller_nostr_pubkey,
      amountSats: Number(row.amount_sats),
      status: payout.status,
      invoice: payout.payout_invoice,
      attemptCount: Number(payout.attempt_count),
      async saveInvoice(invoice) {
        const result = await query(
          "UPDATE hodl_escrow_payouts SET payout_invoice = $2, invoice_stored_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE payment_hash = $1 AND payout_invoice IS NULL AND status <> 'paid'",
          [hash, invoice]
        );
        if (result.rowCount !== 1)
          throw new Error("Payout invoice is already recorded");
      },
      async recordAttempt() {
        await query(
          "UPDATE hodl_escrow_payouts SET attempt_count = attempt_count + 1, claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE payment_hash = $1 AND status <> 'paid'",
          [hash]
        );
      },
      async finish(status, reason) {
        await query(
          "UPDATE hodl_escrow_payouts SET status = $2, last_error = $3, updated_at = CURRENT_TIMESTAMP, paid_at = CASE WHEN $2 = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_at END WHERE payment_hash = $1 AND status <> 'paid'",
          [hash, status, reason?.slice(0, 500) ?? null]
        );
      },
    });
  } finally {
    if (locked && !broken) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1), 606)", [
          hash,
        ]);
      } catch {
        broken = true;
      }
    }
    client.removeListener("error", onError);
    client.release(broken);
  }
}

/** A settled order is itself a durable obligation, including after a crash before payout-row creation. */
export async function listOwedHodlPayouts(): Promise<string[]> {
  const result = await (
    await getInitializedDbPool()
  ).query(`
    SELECT o.payment_hash FROM hodl_escrow_orders o
    LEFT JOIN hodl_escrow_payouts p USING (payment_hash)
    WHERE o.status = 'settled' AND (p.status IS NULL OR p.status <> 'paid')
      AND (p.updated_at IS NULL OR p.updated_at < CURRENT_TIMESTAMP - INTERVAL '30 seconds')
    ORDER BY p.updated_at ASC NULLS FIRST, o.payment_hash LIMIT 100
  `);
  return result.rows.map((row) => row.payment_hash);
}

export async function getHodlPayoutStatus(
  hash: string
): Promise<PayoutStatus | null> {
  const result = await (
    await getInitializedDbPool()
  ).query("SELECT status FROM hodl_escrow_payouts WHERE payment_hash = $1", [
    hash,
  ]);
  return result.rows[0]?.status ?? null;
}
