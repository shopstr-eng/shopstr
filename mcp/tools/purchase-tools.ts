import { getDbPool } from "@/utils/db/db-service";
import { canActorUpdateMcpOrderStatus } from "./order-status-auth";

export interface CreateOrderInput {
  productId: string;
  quantity: number;
  shippingAddress?: {
    name: string;
    address: string;
    unit?: string;
    city: string;
    postalCode: string;
    stateProvince: string;
    country: string;
  };
}

export interface McpOrder {
  id: number;
  order_id: string;
  api_key_id: number | null;
  buyer_pubkey: string;
  seller_pubkey: string;
  product_id: string;
  product_title: string | null;
  quantity: number;
  amount_total: number;
  currency: string;
  shipping_address: Record<string, string> | null;
  payment_ref: string | null;
  payment_status: string;
  order_status: string;
  created_at: string;
  updated_at: string;
}

export async function createMcpOrder(
  orderId: string,
  apiKeyId: number | null,
  buyerPubkey: string,
  sellerPubkey: string,
  productId: string,
  productTitle: string | null,
  quantity: number,
  amountTotal: number,
  currency: string,
  shippingAddress: Record<string, string> | null,
  paymentRef: string | null
): Promise<McpOrder> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `INSERT INTO mcp_orders (order_id, api_key_id, buyer_pubkey, seller_pubkey, product_id, product_title, quantity, amount_total, currency, shipping_address, payment_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        orderId,
        apiKeyId,
        buyerPubkey,
        sellerPubkey,
        productId,
        productTitle,
        quantity,
        amountTotal,
        currency,
        shippingAddress ? JSON.stringify(shippingAddress) : null,
        paymentRef,
      ] as any[]
    );
    return result.rows[0];
  } finally {
    if (client) client.release();
  }
}

export async function getMcpOrder(orderId: string): Promise<McpOrder | null> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT * FROM mcp_orders WHERE order_id = $1`,
      [orderId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  } finally {
    if (client) client.release();
  }
}

const DEFAULT_ORDER_LIST_LIMIT = 50;
const MAX_ORDER_LIST_LIMIT = 100;

// Postgres rejects negative or fractional LIMIT/OFFSET values, and an
// uncapped limit would return a seller's whole order history (including
// every buyer's shipping address) in one response. Invalid values fall
// back to the defaults instead of surfacing as database errors.
function normalizeOrderListPagination(
  limit: number,
  offset: number
): { limit: number; offset: number } {
  return {
    limit:
      Number.isSafeInteger(limit) && limit > 0
        ? Math.min(limit, MAX_ORDER_LIST_LIMIT)
        : DEFAULT_ORDER_LIST_LIMIT,
    offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
  };
}

export async function listMcpOrders(
  buyerPubkey: string,
  limit: number = DEFAULT_ORDER_LIST_LIMIT,
  offset: number = 0
): Promise<McpOrder[]> {
  const pagination = normalizeOrderListPagination(limit, offset);
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT * FROM mcp_orders WHERE buyer_pubkey = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [buyerPubkey, pagination.limit, pagination.offset] as any[]
    );
    return result.rows;
  } finally {
    if (client) client.release();
  }
}

export async function listMcpOrdersAsSeller(
  sellerPubkey: string,
  limit: number = DEFAULT_ORDER_LIST_LIMIT,
  offset: number = 0
): Promise<McpOrder[]> {
  const pagination = normalizeOrderListPagination(limit, offset);
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT * FROM mcp_orders WHERE seller_pubkey = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [sellerPubkey, pagination.limit, pagination.offset] as any[]
    );
    return result.rows;
  } finally {
    if (client) client.release();
  }
}

export async function updateMcpOrderPayment(
  orderId: string,
  paymentRef: string,
  paymentStatus: string
): Promise<McpOrder | null> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `UPDATE mcp_orders SET payment_ref = $1, payment_status = $2, updated_at = CURRENT_TIMESTAMP WHERE order_id = $3 RETURNING *`,
      [paymentRef, paymentStatus, orderId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  } finally {
    if (client) client.release();
  }
}

export interface McpLightningPayment {
  order_id: string;
  quote_id: string;
  mint_url: string;
  amount_sats: number;
  product_address: string;
  selected_specs: Record<string, any> | null;
  /** The minted payment, kept until the seller has it. */
  seller_token: string | null;
  /** Seconds since the mint was claimed, or null if no one claimed it. */
  claim_age_seconds: number | null;
}

export async function saveMcpLightningPayment(payment: {
  orderId: string;
  quoteId: string;
  mintUrl: string;
  amountSats: number;
  productAddress: string;
  selectedSpecs?: Record<string, any>;
}): Promise<void> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query(
      `INSERT INTO mcp_lightning_payments (order_id, quote_id, mint_url, amount_sats, product_address, selected_specs)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        payment.orderId,
        payment.quoteId,
        payment.mintUrl,
        payment.amountSats,
        payment.productAddress,
        payment.selectedSpecs ? JSON.stringify(payment.selectedSpecs) : null,
      ] as any[]
    );
  } finally {
    if (client) client.release();
  }
}

export async function getMcpLightningPayment(
  orderId: string
): Promise<McpLightningPayment | null> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT *, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - claimed_at)) AS claim_age_seconds
       FROM mcp_lightning_payments WHERE order_id = $1`,
      [orderId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      ...row,
      claim_age_seconds:
        row.claim_age_seconds === null ? null : Number(row.claim_age_seconds),
    };
  } finally {
    if (client) client.release();
  }
}

// Only one request may mint a paid quote. The mint cannot be repeated, so the
// claim is taken before minting and only one caller gets true.
export async function claimMcpLightningMint(orderId: string): Promise<boolean> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `UPDATE mcp_lightning_payments SET claimed_at = CURRENT_TIMESTAMP
       WHERE order_id = $1 AND claimed_at IS NULL AND seller_token IS NULL
       RETURNING order_id`,
      [orderId]
    );
    return result.rows.length > 0;
  } finally {
    if (client) client.release();
  }
}

export async function releaseMcpLightningClaim(orderId: string): Promise<void> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query(
      `UPDATE mcp_lightning_payments SET claimed_at = NULL
       WHERE order_id = $1 AND seller_token IS NULL`,
      [orderId]
    );
  } finally {
    if (client) client.release();
  }
}

export async function setMcpLightningToken(
  orderId: string,
  token: string | null
): Promise<void> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query(
      `UPDATE mcp_lightning_payments SET seller_token = $1 WHERE order_id = $2`,
      [token, orderId]
    );
  } finally {
    if (client) client.release();
  }
}

export async function updateMcpOrderStatus(
  orderId: string,
  orderStatus: string,
  actorPubkey: string
): Promise<McpOrder | null> {
  const order = await getMcpOrder(orderId);
  if (
    !order ||
    !canActorUpdateMcpOrderStatus(order, orderStatus, actorPubkey)
  ) {
    return null;
  }

  const ownerColumn =
    actorPubkey === order.seller_pubkey ? "seller_pubkey" : "buyer_pubkey";

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `UPDATE mcp_orders
       SET order_status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $2
         AND ${ownerColumn} = $3
       RETURNING *`,
      [orderStatus, orderId, actorPubkey]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  } finally {
    if (client) client.release();
  }
}

export async function updateMcpOrderAddress(
  orderId: string,
  buyerPubkey: string,
  newAddress: Record<string, string>
): Promise<McpOrder | null> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `UPDATE mcp_orders SET shipping_address = $1, updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $2 AND buyer_pubkey = $3 RETURNING *`,
      [JSON.stringify(newAddress), orderId, buyerPubkey] as any[]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
  } finally {
    if (client) client.release();
  }
}

export function formatOrderForResponse(order: McpOrder) {
  return {
    orderId: order.order_id,
    buyerPubkey: order.buyer_pubkey,
    sellerPubkey: order.seller_pubkey,
    productId: order.product_id,
    productTitle: order.product_title,
    quantity: order.quantity,
    amountTotal: parseFloat(String(order.amount_total)),
    currency: order.currency,
    shippingAddress: order.shipping_address,
    paymentStatus: order.payment_status,
    orderStatus: order.order_status,
    paymentRef: order.payment_ref,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}
