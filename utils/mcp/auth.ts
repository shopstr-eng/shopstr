import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { getDbPool } from "@/utils/db/db-service";

export type ApiKeyPermission = "read" | "read_write";

export interface ApiKeyRecord {
  id: number;
  key_prefix: string;
  key_hash: string;
  name: string;
  pubkey: string;
  permissions: ApiKeyPermission;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

export interface AuthenticatedRequest extends NextApiRequest {
  apiKey?: ApiKeyRecord;
}

export function hashApiKey(key: string): string {
  const salt = randomBytes(16);
  const iterations = 100_000;
  const derivedKey = pbkdf2Sync(key, salt, iterations, 32, "sha256");
  const saltHex = salt.toString("hex");
  const hashHex = derivedKey.toString("hex");
  // format: algorithm$iterations$salt$hash
  return `pbkdf2_sha256$${iterations}$${saltHex}$${hashHex}`;
}

export function generateApiKey(): { key: string; prefix: string } {
  const key = `sk_${randomBytes(32).toString("hex")}`;
  const prefix = key.substring(0, 10);
  return { key, prefix };
}

export async function initializeApiKeysTable(): Promise<void> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS mcp_api_keys (
        id SERIAL PRIMARY KEY,
        key_prefix TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        pubkey TEXT NOT NULL,
        permissions TEXT NOT NULL DEFAULT 'read' CHECK (permissions IN ('read', 'read_write')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE
      );
      CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_key_hash ON mcp_api_keys(key_hash);
      CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_pubkey ON mcp_api_keys(pubkey);

      CREATE TABLE IF NOT EXISTS mcp_orders (
        id SERIAL PRIMARY KEY,
        order_id TEXT NOT NULL UNIQUE,
        api_key_id INTEGER REFERENCES mcp_api_keys(id),
        buyer_pubkey TEXT NOT NULL,
        seller_pubkey TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_title TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        amount_total NUMERIC(12,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'sats',
        shipping_address JSONB,
        payment_ref TEXT,
        payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed', 'refunded')),
        order_status TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_mcp_orders_order_id ON mcp_orders(order_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_orders_buyer_pubkey ON mcp_orders(buyer_pubkey);
      CREATE INDEX IF NOT EXISTS idx_mcp_orders_api_key_id ON mcp_orders(api_key_id);
    `);
  } catch (error) {
    console.error("Failed to initialize MCP tables:", error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

export async function createApiKey(
  name: string,
  pubkey: string,
  permissions: ApiKeyPermission = "read"
): Promise<{ key: string; record: ApiKeyRecord }> {
  const { key, prefix } = generateApiKey();
  const keyHash = hashApiKey(key);

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `INSERT INTO mcp_api_keys (key_prefix, key_hash, name, pubkey, permissions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [prefix, keyHash, name, pubkey, permissions]
    );
    return { key, record: result.rows[0] };
  } finally {
    if (client) client.release();
  }
}

export function verifyApiKey(key: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = parseInt(parts[1]!, 10);
  const salt = Buffer.from(parts[2]!, "hex");
  const expectedKey = Buffer.from(parts[3]!, "hex");
  const derivedKey = pbkdf2Sync(
    key,
    salt,
    iterations,
    expectedKey.length,
    "sha256"
  );
  return timingSafeEqual(derivedKey, expectedKey);
}

export async function validateApiKey(
  key: string
): Promise<ApiKeyRecord | null> {
  const prefix = key.substring(0, 10);

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT * FROM mcp_api_keys WHERE key_prefix = $1 AND is_active = TRUE`,
      [prefix]
    );

    const match = result.rows.find((row: ApiKeyRecord) =>
      verifyApiKey(key, row.key_hash)
    );
    if (!match) return null;

    await client.query(
      `UPDATE mcp_api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [match.id]
    );

    return match;
  } finally {
    if (client) client.release();
  }
}

export async function listApiKeys(pubkey: string): Promise<ApiKeyRecord[]> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `SELECT id, key_prefix, name, pubkey, permissions, created_at, last_used_at, is_active
       FROM mcp_api_keys WHERE pubkey = $1 ORDER BY created_at DESC`,
      [pubkey]
    );
    return result.rows;
  } finally {
    if (client) client.release();
  }
}

export async function revokeApiKey(
  id: number,
  pubkey: string
): Promise<boolean> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      `UPDATE mcp_api_keys SET is_active = FALSE WHERE id = $1 AND pubkey = $2`,
      [id, pubkey] as any[]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    if (client) client.release();
  }
}

export function extractBearerToken(req: NextApiRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.substring(7);
}

export async function authenticateRequest(
  req: NextApiRequest,
  res: NextApiResponse,
  requiredPermission?: ApiKeyPermission
): Promise<ApiKeyRecord | null> {
  const token = extractBearerToken(req);
  if (!token) {
    res
      .status(401)
      .json({ error: "Missing API key. Use Authorization: Bearer <key>" });
    return null;
  }

  const apiKey = await validateApiKey(token);
  if (!apiKey) {
    res.status(401).json({ error: "Invalid or revoked API key" });
    return null;
  }

  if (
    requiredPermission === "read_write" &&
    apiKey.permissions !== "read_write"
  ) {
    res.status(403).json({
      error:
        "Insufficient permissions. This action requires read_write access.",
    });
    return null;
  }

  return apiKey;
}
