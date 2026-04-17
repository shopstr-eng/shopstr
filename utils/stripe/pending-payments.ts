import type { PoolClient } from "pg";
import { getDbPool } from "@/utils/db/db-service";

export type PendingPaymentStatus =
  | "creating"
  | "created"
  | "succeeded"
  | "failed_terminal"
  | "abandoned";

export interface PendingPaymentRecord {
  intentRef: string;
  paymentIntentId: string | null;
  amount: number;
  currency: string;
  status: PendingPaymentStatus;
  metadata: Record<string, unknown>;
  lastErrorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

let tableInitialized = false;

async function ensureTable(client: PoolClient): Promise<void> {
  if (tableInitialized) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS stripe_pending_payments (
      intent_ref TEXT PRIMARY KEY,
      payment_intent_id TEXT,
      amount BIGINT NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_error_message TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `);
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_stripe_pending_payments_status
       ON stripe_pending_payments(status)`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_stripe_pending_payments_payment_intent_id
       ON stripe_pending_payments(payment_intent_id)`
  );
  tableInitialized = true;
}

function rowToRecord(row: any): PendingPaymentRecord {
  return {
    intentRef: row.intent_ref,
    paymentIntentId: row.payment_intent_id ?? null,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status as PendingPaymentStatus,
    metadata: row.metadata ?? {},
    lastErrorMessage: row.last_error_message ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function recordPendingPayment(input: {
  intentRef: string;
  amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const now = Date.now();
    await client.query(
      `INSERT INTO stripe_pending_payments
         (intent_ref, payment_intent_id, amount, currency, status, metadata, created_at, updated_at)
       VALUES ($1, NULL, $2, $3, 'creating', $4::jsonb, $5, $5)
       ON CONFLICT (intent_ref) DO NOTHING`,
      [
        input.intentRef,
        input.amount,
        input.currency,
        JSON.stringify(input.metadata ?? {}),
        now,
      ]
    );
  } finally {
    client.release();
  }
}

export async function updatePendingPayment(
  intentRef: string,
  patch: Partial<{
    paymentIntentId: string | null;
    status: PendingPaymentStatus;
    lastErrorMessage: string | null;
    metadata: Record<string, unknown>;
  }>
): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.paymentIntentId !== undefined) {
      fields.push(`payment_intent_id = $${i++}`);
      values.push(patch.paymentIntentId);
    }
    if (patch.status !== undefined) {
      fields.push(`status = $${i++}`);
      values.push(patch.status);
    }
    if (patch.lastErrorMessage !== undefined) {
      fields.push(`last_error_message = $${i++}`);
      values.push(patch.lastErrorMessage);
    }
    if (patch.metadata !== undefined) {
      fields.push(`metadata = $${i++}::jsonb`);
      values.push(JSON.stringify(patch.metadata));
    }
    fields.push(`updated_at = $${i++}`);
    values.push(Date.now());
    values.push(intentRef);
    await client.query(
      `UPDATE stripe_pending_payments SET ${fields.join(", ")} WHERE intent_ref = $${i}`,
      values
    );
  } finally {
    client.release();
  }
}

export async function markPendingPaymentByIntent(
  paymentIntentId: string,
  status: PendingPaymentStatus,
  lastErrorMessage?: string | null
): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await ensureTable(client);
    await client.query(
      `UPDATE stripe_pending_payments
         SET status = $1, last_error_message = $2, updated_at = $3
       WHERE payment_intent_id = $4`,
      [status, lastErrorMessage ?? null, Date.now(), paymentIntentId]
    );
  } finally {
    client.release();
  }
}

export async function getPendingPayment(
  intentRef: string
): Promise<PendingPaymentRecord | null> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const result = await client.query(
      `SELECT * FROM stripe_pending_payments WHERE intent_ref = $1`,
      [intentRef]
    );
    if (result.rows.length === 0) return null;
    return rowToRecord(result.rows[0]);
  } finally {
    client.release();
  }
}

/**
 * Best-effort cleanup helper: drop terminal pending-payment records
 * (`succeeded`, `failed_terminal`, `abandoned`) older than `maxAgeMs`.
 * Active rows (`creating`, `created`) are preserved regardless of age so
 * orphan-recovery flows can still see them. Defaults to 30 days.
 */
export async function pruneStripePendingPayments(
  maxAgeMs: number = 30 * 24 * 60 * 60 * 1000
): Promise<number> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const result = await client.query(
      `DELETE FROM stripe_pending_payments
        WHERE updated_at < $1
          AND status IN ('succeeded', 'failed_terminal', 'abandoned')`,
      [Date.now() - maxAgeMs]
    );
    return result.rowCount ?? 0;
  } finally {
    client.release();
  }
}

export async function listPendingPayments(
  status: PendingPaymentStatus = "created",
  limit = 100
): Promise<PendingPaymentRecord[]> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const result = await client.query(
      `SELECT * FROM stripe_pending_payments
        WHERE status = $1 ORDER BY created_at ASC LIMIT $2`,
      [status, limit]
    );
    return result.rows.map(rowToRecord);
  } finally {
    client.release();
  }
}
