import { Invoice } from "@getalby/lightning-tools";
import { getInitializedDbPool } from "./db-service";
import {
  decryptHodlValue,
  encryptHodlValue,
} from "@/utils/lightning/hodl-storage";
import type { HodlOrderDetails } from "@/utils/lightning/hodl-order-details";
import {
  validateFulfillmentUpdate,
  type HodlFulfillmentUpdate,
} from "@/utils/lightning/hodl-fulfillment";

export type StoredHodlOrder = {
  paymentHash: string;
  buyerPubkey: string;
  sellerPubkey: string;
  arbiterPubkey: string;
  amountSats: number;
  status: string;
  payoutStatus: string | null;
  createdAt: number;
  details: HodlOrderDetails | null;
  invoice?: string;
  expiresAt?: number;
  acceptedAt?: number | null;
  holdExpiryHeight?: number | null;
  observedBlockHeight?: number | null;
  deadlineObservedAt?: number | null;
  fulfillmentStatus?: string | null;
  fulfillmentUpdates?: HodlFulfillmentUpdate | null;
  payoutError?: string | null;
  payoutAttempts?: number;
};
const COLUMNS = `o.payment_hash, o.buyer_nostr_pubkey, o.seller_nostr_pubkey, o.arbiter_nostr_pubkey,
 o.amount_sats, o.status, o.invoice, EXTRACT(EPOCH FROM o.accepted_at) AS accepted_at,
 o.hold_expiry_height, o.observed_block_height, EXTRACT(EPOCH FROM o.deadline_observed_at) AS deadline_observed_at,
 o.order_details, o.fulfillment_updates, o.fulfillment_status, p.status AS payout_status, p.last_error, p.attempt_count`;
function unpack(row: Record<string, any>, actor: string): StoredHodlOrder {
  const hash = row.payment_hash;
  // Legacy TIMESTAMP columns have no timezone. BOLT11 binds these exact times
  // to the payable invoice; its default expiry is 3600 seconds (BOLT 11).
  const invoice = new Invoice({ pr: row.invoice });
  return {
    paymentHash: hash,
    buyerPubkey: row.buyer_nostr_pubkey,
    sellerPubkey: row.seller_nostr_pubkey,
    arbiterPubkey: row.arbiter_nostr_pubkey,
    amountSats: Number(row.amount_sats),
    status: row.status,
    payoutStatus: row.payout_status,
    createdAt: invoice.timestamp,
    expiresAt: invoice.timestamp + (invoice.expiry ?? 3600),
    acceptedAt: row.accepted_at == null ? null : Number(row.accepted_at),
    holdExpiryHeight:
      row.hold_expiry_height == null ? null : Number(row.hold_expiry_height),
    observedBlockHeight:
      row.observed_block_height == null
        ? null
        : Number(row.observed_block_height),
    deadlineObservedAt:
      row.deadline_observed_at == null
        ? null
        : Number(row.deadline_observed_at),
    ...(actor === row.buyer_nostr_pubkey && row.status === "open"
      ? { invoice: row.invoice }
      : {}),
    details: row.order_details
      ? JSON.parse(decryptHodlValue(row.order_details, hash, "order"))
      : null,
    fulfillmentStatus: row.fulfillment_status,
    fulfillmentUpdates: row.fulfillment_updates
      ? JSON.parse(
          decryptHodlValue(row.fulfillment_updates, hash, "fulfillment")
        )
      : null,
    ...(actor !== row.buyer_nostr_pubkey
      ? {
          payoutError: row.last_error,
          payoutAttempts: Number(row.attempt_count ?? 0),
        }
      : {}),
  };
}
export async function listHodlOrders(
  pubkey: string,
  after = "",
  arbiter = false
): Promise<StoredHodlOrder[]> {
  const result = await (
    await getInitializedDbPool()
  ).query(
    `SELECT ${COLUMNS} FROM hodl_escrow_orders o LEFT JOIN hodl_escrow_payouts p USING (payment_hash)
   WHERE ${arbiter ? "o.arbiter_nostr_pubkey = $1" : "(o.buyer_nostr_pubkey = $1 OR o.seller_nostr_pubkey = $1)"}
   AND o.payment_hash > $2 ORDER BY o.payment_hash LIMIT 100`,
    [pubkey, after]
  );
  return result.rows.map((row) => unpack(row, pubkey));
}
export async function getHodlOrderForActor(
  hash: string,
  actor: string
): Promise<StoredHodlOrder | null> {
  const result = await (
    await getInitializedDbPool()
  ).query(
    `SELECT ${COLUMNS} FROM hodl_escrow_orders o LEFT JOIN hodl_escrow_payouts p USING (payment_hash)
   WHERE o.payment_hash = $1 AND $2 IN (o.buyer_nostr_pubkey, o.seller_nostr_pubkey, o.arbiter_nostr_pubkey)`,
    [hash, actor]
  );
  return result.rows[0] ? unpack(result.rows[0], actor) : null;
}
export async function updateHodlFulfillment(
  hash: string,
  actor: string,
  update: unknown
): Promise<void> {
  const client = await (await getInitializedDbPool()).connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT buyer_nostr_pubkey, seller_nostr_pubkey, status, fulfillment_status, fulfillment_updates, hold_expiry_height, observed_block_height FROM hodl_escrow_orders WHERE payment_hash=$1 FOR UPDATE",
      [hash]
    );
    const row = rows[0];
    const role =
      actor === row?.buyer_nostr_pubkey
        ? "buyer"
        : actor === row?.seller_nostr_pubkey
          ? "seller"
          : null;
    if (!role) throw new Error("No such order");
    if (
      role === "seller" &&
      (!row.hold_expiry_height ||
        row.observed_block_height == null ||
        Number(row.hold_expiry_height) - Number(row.observed_block_height) <=
          18)
    )
      throw new Error("Insufficient hold window");
    const change = validateFulfillmentUpdate(
      update,
      role,
      row.status,
      row.fulfillment_status
    );
    const previous = row.fulfillment_updates
      ? JSON.parse(
          decryptHodlValue(row.fulfillment_updates, hash, "fulfillment")
        )
      : {};
    await client.query(
      "UPDATE hodl_escrow_orders SET fulfillment_updates=$2, fulfillment_status=COALESCE($3, fulfillment_status) WHERE payment_hash=$1",
      [
        hash,
        encryptHodlValue(
          JSON.stringify({ ...previous, ...change }),
          hash,
          "fulfillment"
        ),
        change.status ?? null,
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
