import { getDbPool } from "@/utils/db/db-service";

const DEFAULT_DONATION_PERCENT = 0;

const cache = new Map<string, { percent: number; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getSellerDonationPercent(
  sellerPubkey: string
): Promise<number> {
  if (!sellerPubkey) return DEFAULT_DONATION_PERCENT;

  const now = Date.now();
  const cached = cache.get(sellerPubkey);
  if (cached && cached.expiresAt > now) {
    return cached.percent;
  }

  let percent = DEFAULT_DONATION_PERCENT;
  let client;
  try {
    const pool = getDbPool();
    client = await pool.connect();
    const result = await client.query(
      `SELECT content FROM profile_events
       WHERE pubkey = $1 AND kind = 0
       ORDER BY created_at DESC LIMIT 1`,
      [sellerPubkey]
    );
    if (result.rows.length > 0) {
      try {
        const content = JSON.parse(result.rows[0].content);
        const raw = content?.mm_donation;
        if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
          percent = Math.min(raw, 100);
        } else if (typeof raw === "string" && raw.trim() !== "") {
          const parsed = Number(raw);
          if (Number.isFinite(parsed) && parsed >= 0) {
            percent = Math.min(parsed, 100);
          }
        }
      } catch {
        // malformed profile content — fall back to default
      }
    }
  } catch (err) {
    console.warn(
      "getSellerDonationPercent: profile lookup failed, using default",
      err
    );
  } finally {
    if (client) client.release();
  }

  cache.set(sellerPubkey, { percent, expiresAt: now + CACHE_TTL_MS });
  return percent;
}

export function computeDonationCutSmallest(
  grossSmallest: number,
  donationPercent: number
): number {
  if (
    !Number.isFinite(grossSmallest) ||
    grossSmallest <= 0 ||
    !Number.isFinite(donationPercent) ||
    donationPercent <= 0
  ) {
    return 0;
  }
  const cut = Math.ceil((grossSmallest * donationPercent) / 100);
  if (cut >= grossSmallest) return 0;
  return cut;
}

export function isPlatformPubkey(
  sellerPubkey: string | undefined | null
): boolean {
  if (!sellerPubkey) return false;
  return sellerPubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK;
}

export async function resolveDonationCut(
  sellerPubkey: string | undefined | null,
  grossSmallest: number
): Promise<{ percent: number; cutSmallest: number }> {
  if (!sellerPubkey || isPlatformPubkey(sellerPubkey)) {
    return { percent: 0, cutSmallest: 0 };
  }
  const percent = await getSellerDonationPercent(sellerPubkey);
  const cutSmallest = computeDonationCutSmallest(grossSmallest, percent);
  return { percent, cutSmallest };
}
