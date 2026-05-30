// Bitcoin (Lightning) rail for manual Pro invoices. Payments route to the
// Milk Market platform Lightning address — the same destination used for
// donations (`NEXT_PUBLIC_MILK_MARKET_PK`'s profile lud16) — and auto-verify
// via LNURL-verify, mirroring the donation rail's "skip gracefully if unset"
// behavior.

import {
  LightningAddress,
  Invoice,
  getSatoshiValue,
} from "@getalby/lightning-tools";
import { getDbPool } from "@/utils/db/db-service";

export interface PlatformBitcoinInvoice {
  bolt11: string;
  verify: string | null;
  paymentHash: string;
  sats: number;
}

/**
 * Resolve the platform's Lightning address. Prefers an explicit env override,
 * otherwise reads `lud16` from the Milk Market npub's cached kind-0 profile —
 * the same source the donation rail uses for its destination.
 */
export async function getPlatformLightningAddress(): Promise<string | null> {
  const override = process.env.NEXT_PUBLIC_MILK_MARKET_LN_ADDRESS;
  if (override && override.trim() !== "") return override.trim();

  const pk = process.env.NEXT_PUBLIC_MILK_MARKET_PK;
  if (!pk) return null;

  let client;
  try {
    const pool = getDbPool();
    client = await pool.connect();
    const result = await client.query(
      `SELECT content FROM profile_events
       WHERE pubkey = $1 AND kind = 0
       ORDER BY created_at DESC LIMIT 1`,
      [pk]
    );
    if (result.rows.length > 0) {
      const content = JSON.parse(result.rows[0].content);
      const lud16 = content?.lud16;
      if (typeof lud16 === "string" && lud16.includes("@")) {
        return lud16.trim();
      }
    }
  } catch (err) {
    console.warn("getPlatformLightningAddress: profile lookup failed", err);
  } finally {
    if (client) client.release();
  }
  return null;
}

/**
 * Create a Lightning invoice payable to the platform for a USD amount. Returns
 * null when no platform Lightning address is configured (caller should treat
 * Bitcoin as unavailable, exactly like donations skip when unset).
 */
export async function createPlatformBitcoinInvoice(
  amountUsd: number,
  memo?: string
): Promise<PlatformBitcoinInvoice | null> {
  const address = await getPlatformLightningAddress();
  if (!address) return null;

  const sats = Math.ceil(
    await getSatoshiValue({ amount: amountUsd, currency: "usd" })
  );
  if (!Number.isFinite(sats) || sats <= 0) {
    throw new Error("Failed to convert Pro price to satoshis");
  }

  const ln = new LightningAddress(address);
  await ln.fetch();
  const invoice = await ln.requestInvoice({
    satoshi: sats,
    ...(memo ? { comment: memo.slice(0, 180) } : {}),
  });

  return {
    bolt11: invoice.paymentRequest,
    verify: invoice.verify ?? null,
    paymentHash: invoice.paymentHash,
    sats,
  };
}

/**
 * Verify whether a previously-issued Lightning invoice has been paid, using
 * the stored LNURL-verify endpoint.
 */
export async function verifyBitcoinInvoicePaid(
  bolt11: string,
  verifyUrl: string | null
): Promise<boolean> {
  if (!bolt11 || !verifyUrl) return false;
  try {
    const invoice = new Invoice({ pr: bolt11, verify: verifyUrl });
    return await invoice.verifyPayment();
  } catch (err) {
    console.warn("verifyBitcoinInvoicePaid failed:", err);
    return false;
  }
}
