import { getDbPool } from "@/utils/db/db-service";
import { canActorUpdateMcpOrderStatus } from "./order-status-auth";

export interface CreateOrderInput {
  productId: string;
  quantity: number;
  buyerEmail?: string;
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
  buyer_email: string | null;
  shipping_address: Record<string, string> | null;
  payment_intent_id: string | null;
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
  buyerEmail: string | null,
  shippingAddress: Record<string, string> | null,
  paymentIntentId: string | null
): Promise<McpOrder> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `INSERT INTO mcp_orders (order_id, api_key_id, buyer_pubkey, seller_pubkey, product_id, product_title, quantity, amount_total, currency, buyer_email, shipping_address, payment_intent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        buyerEmail,
        shippingAddress ? JSON.stringify(shippingAddress) : null,
        paymentIntentId,
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

export async function listMcpOrders(
  buyerPubkey: string,
  limit: number = 50,
  offset: number = 0
): Promise<McpOrder[]> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT * FROM mcp_orders WHERE buyer_pubkey = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [buyerPubkey, limit, offset] as any[]
    );
    return result.rows;
  } finally {
    if (client) client.release();
  }
}

export async function listMcpOrdersAsSeller(
  sellerPubkey: string,
  limit: number = 50,
  offset: number = 0
): Promise<McpOrder[]> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT * FROM mcp_orders WHERE seller_pubkey = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [sellerPubkey, limit, offset] as any[]
    );
    return result.rows;
  } finally {
    if (client) client.release();
  }
}

export async function updateMcpOrderPayment(
  orderId: string,
  paymentIntentId: string,
  paymentStatus: string
): Promise<McpOrder | null> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `UPDATE mcp_orders SET payment_intent_id = $1, payment_status = $2, updated_at = CURRENT_TIMESTAMP WHERE order_id = $3 RETURNING *`,
      [paymentIntentId, paymentStatus, orderId]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
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
    productId: order.product_id,
    productTitle: order.product_title,
    quantity: order.quantity,
    amountTotal: parseFloat(String(order.amount_total)),
    currency: order.currency,
    buyerEmail: order.buyer_email,
    shippingAddress: order.shipping_address,
    paymentStatus: order.payment_status,
    orderStatus: order.order_status,
    paymentIntentId: order.payment_intent_id,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}
