import { getDbPool } from "./db-service";

export async function ensureInventoryTable(): Promise<void> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        product_id TEXT NOT NULL,
        seller_pubkey TEXT NOT NULL,
        variant_key TEXT NOT NULL DEFAULT '_default',
        quantity INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('system', 'seller_override', 'nostr_sync')),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_id, variant_key)
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_seller_pubkey ON inventory(seller_pubkey);

      CREATE TABLE IF NOT EXISTS inventory_log (
        id SERIAL PRIMARY KEY,
        product_id TEXT NOT NULL,
        variant_key TEXT NOT NULL DEFAULT '_default',
        change_amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        order_id TEXT,
        previous_quantity INTEGER NOT NULL,
        new_quantity INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_log_product_id ON inventory_log(product_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_log_order_id ON inventory_log(order_id);
    `);
  } finally {
    if (client) client.release();
  }
}

let tableReady = false;
async function ensureReady() {
  if (!tableReady) {
    await ensureInventoryTable();
    tableReady = true;
  }
}

export async function getStock(
  productId: string,
  variantKey: string = "_default"
): Promise<{ tracked: boolean; quantity: number }> {
  await ensureReady();
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND variant_key = $2`,
      [productId, variantKey]
    );
    if (result.rows.length === 0) {
      return { tracked: false, quantity: -1 };
    }
    return { tracked: true, quantity: result.rows[0].quantity };
  } finally {
    if (client) client.release();
  }
}

export async function getAllStock(productId: string): Promise<{
  default_quantity: number | null;
  variants: Record<string, number>;
}> {
  await ensureReady();
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT variant_key, quantity FROM inventory WHERE product_id = $1`,
      [productId]
    );
    let default_quantity: number | null = null;
    const variants: Record<string, number> = {};
    for (const row of result.rows) {
      if (row.variant_key === "_default") {
        default_quantity = row.quantity;
      } else {
        variants[row.variant_key] = row.quantity;
      }
    }
    return { default_quantity, variants };
  } finally {
    if (client) client.release();
  }
}

export async function setStock(
  productId: string,
  sellerPubkey: string,
  quantity: number,
  variantKey: string = "_default",
  source: string = "system"
): Promise<{ previous: number; current: number }> {
  await ensureReady();
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND variant_key = $2`,
      [productId, variantKey]
    );
    const previousQuantity =
      existing.rows.length > 0 ? existing.rows[0].quantity : 0;

    await client.query(
      `INSERT INTO inventory (product_id, seller_pubkey, variant_key, quantity, source, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (product_id, variant_key) DO UPDATE
       SET quantity = $4, source = $5, seller_pubkey = $2, updated_at = NOW()`,
      [productId, sellerPubkey, variantKey, quantity, source]
    );

    await client.query(
      `INSERT INTO inventory_log (product_id, variant_key, change_amount, reason, previous_quantity, new_quantity)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        productId,
        variantKey,
        quantity - previousQuantity,
        `stock_set_${source}`,
        previousQuantity,
        quantity,
      ]
    );

    await client.query("COMMIT");
    return { previous: previousQuantity, current: quantity };
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    throw error;
  } finally {
    if (client) client.release();
  }
}

export async function deductStock(
  productId: string,
  amount: number,
  orderId: string,
  variantKey: string = "_default"
): Promise<{
  success: boolean;
  previous: number;
  current: number;
  error?: string;
}> {
  await ensureReady();
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND variant_key = $2 FOR UPDATE`,
      [productId, variantKey]
    );

    if (result.rows.length === 0) {
      await client.query("COMMIT");
      return { success: true, previous: -1, current: -1 };
    }

    const currentQty = result.rows[0].quantity;
    if (currentQty < amount) {
      await client.query("COMMIT");
      return {
        success: false,
        previous: currentQty,
        current: currentQty,
        error: `Insufficient stock. Available: ${currentQty}, requested: ${amount}`,
      };
    }

    const newQty = currentQty - amount;
    await client.query(
      `UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE product_id = $2 AND variant_key = $3`,
      [newQty, productId, variantKey]
    );

    await client.query(
      `INSERT INTO inventory_log (product_id, variant_key, change_amount, reason, order_id, previous_quantity, new_quantity)
       VALUES ($1, $2, $3, 'order_deduction', $4, $5, $6)`,
      [productId, variantKey, -amount, orderId, currentQty, newQty]
    );

    await client.query("COMMIT");
    return { success: true, previous: currentQty, current: newQty };
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    throw error;
  } finally {
    if (client) client.release();
  }
}

export async function restoreStock(
  productId: string,
  amount: number,
  orderId: string,
  variantKey: string = "_default"
): Promise<{ success: boolean; previous: number; current: number }> {
  await ensureReady();
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT quantity FROM inventory WHERE product_id = $1 AND variant_key = $2 FOR UPDATE`,
      [productId, variantKey]
    );

    if (result.rows.length === 0) {
      await client.query("COMMIT");
      return { success: true, previous: -1, current: -1 };
    }

    const currentQty = result.rows[0].quantity;
    const newQty = currentQty + amount;

    await client.query(
      `UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE product_id = $2 AND variant_key = $3`,
      [newQty, productId, variantKey]
    );

    await client.query(
      `INSERT INTO inventory_log (product_id, variant_key, change_amount, reason, order_id, previous_quantity, new_quantity)
       VALUES ($1, $2, $3, 'order_cancellation_restore', $4, $5, $6)`,
      [productId, variantKey, amount, orderId, currentQty, newQty]
    );

    await client.query("COMMIT");
    return { success: true, previous: currentQty, current: newQty };
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    throw error;
  } finally {
    if (client) client.release();
  }
}

export async function syncFromNostrEvent(
  productId: string,
  sellerPubkey: string,
  globalQuantity: number | undefined,
  sizeQuantities: Map<string, number> | undefined
): Promise<void> {
  await ensureReady();

  if (globalQuantity !== undefined) {
    await setStock(
      productId,
      sellerPubkey,
      globalQuantity,
      "_default",
      "seller_override"
    );
  }

  if (sizeQuantities) {
    for (const [size, qty] of sizeQuantities.entries()) {
      await setStock(
        productId,
        sellerPubkey,
        qty,
        `size:${size}`,
        "seller_override"
      );
    }
  }
}

export async function checkAvailability(
  productId: string,
  requestedQuantity: number,
  selectedSize?: string
): Promise<{ available: boolean; stock: number; tracked: boolean }> {
  const variantKey = selectedSize ? `size:${selectedSize}` : "_default";
  const { tracked, quantity } = await getStock(productId, variantKey);

  if (!tracked) {
    return { available: true, stock: -1, tracked: false };
  }

  return {
    available: quantity >= requestedQuantity,
    stock: quantity,
    tracked: true,
  };
}
