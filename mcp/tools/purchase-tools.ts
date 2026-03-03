import { getDbPool } from "@/utils/db/db-service";

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

export async function updateMcpOrderStatus(
  orderId: string,
  orderStatus: string
): Promise<McpOrder | null> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `UPDATE mcp_orders SET order_status = $1, updated_at = CURRENT_TIMESTAMP WHERE order_id = $2 RETURNING *`,
      [orderStatus, orderId]
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
    shippingAddress: order.shipping_address,
    paymentStatus: order.payment_status,
    orderStatus: order.order_status,
    paymentRef: order.payment_ref,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };
}
