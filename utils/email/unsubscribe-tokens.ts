/**
 * Affiliate-email unsubscribe tokens.
 *
 * We don't want to email an unsubscribe URL that exposes the affiliate's
 * invite token (the invite token doubles as auth for editing the payout
 * destination). Instead we mint a separate token from
 * `(affiliateId, issuedAtMs, AFFILIATE_UNSUBSCRIBE_SECRET)` so:
 *  - the unsubscribe URL never exposes the invite token,
 *  - operators can rotate `AFFILIATE_UNSUBSCRIBE_SECRET` to invalidate every
 *    outstanding link at once,
 *  - individual links naturally expire after `UNSUBSCRIBE_TOKEN_TTL_MS`
 *    (default 1 year) so a years-old archived email can't unsubscribe a
 *    re-engaged affiliate.
 *
 * Token format: `<affiliateId>.<issuedAtMs>.<mac32>`
 *
 * The MAC binds both the affiliate id and the issued-at timestamp, so an
 * attacker can neither forge a fresh timestamp nor swap one affiliate's
 * timestamp onto another's token.
 */
import { createHmac, timingSafeEqual } from "crypto";

const UNSUBSCRIBE_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

function getSecret(): string {
  const s = process.env.AFFILIATE_UNSUBSCRIBE_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "AFFILIATE_UNSUBSCRIBE_SECRET must be set to a string >= 16 chars"
    );
  }
  return s;
}

/**
 * Boot-time validation. Call from the app's module-init path so a missing
 * secret fails the deploy instead of silently sending unsigned emails.
 * Safe to call repeatedly. Throws in production, warns in dev/test so local
 * runs aren't blocked by an unset secret.
 */
export function assertAffiliateUnsubscribeSecretConfigured(): void {
  const s = process.env.AFFILIATE_UNSUBSCRIBE_SECRET;
  if (!s || s.length < 16) {
    const msg =
      "AFFILIATE_UNSUBSCRIBE_SECRET is missing or too short (need >= 16 chars). " +
      "Affiliate emails will be sent without RFC 8058 unsubscribe headers and " +
      "any one-click unsubscribe attempts will 500.";
    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    }
    // eslint-disable-next-line no-console
    console.warn(`[affiliates] ${msg}`);
  }
}

function macFor(affiliateId: number, issuedAtMs: number): string {
  return createHmac("sha256", getSecret())
    .update(`affiliate-unsub:${affiliateId}:${issuedAtMs}`)
    .digest("hex")
    .slice(0, 32);
}

export function mintAffiliateUnsubscribeToken(
  affiliateId: number,
  nowMs: number = Date.now()
): string {
  return `${affiliateId}.${nowMs}.${macFor(affiliateId, nowMs)}`;
}

export function verifyAffiliateUnsubscribeToken(
  token: string,
  nowMs: number = Date.now()
): { affiliateId: number } | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [idPart, tsPart, macPart] = parts as [string, string, string];
  const affiliateId = Number(idPart);
  const issuedAtMs = Number(tsPart);
  if (!Number.isInteger(affiliateId) || affiliateId <= 0) return null;
  if (!Number.isInteger(issuedAtMs) || issuedAtMs <= 0) return null;
  // Reject tokens issued in the future (clock skew tolerance: 5 minutes) or
  // older than the TTL.
  if (issuedAtMs > nowMs + 5 * 60 * 1000) return null;
  if (nowMs - issuedAtMs > UNSUBSCRIBE_TOKEN_TTL_MS) return null;
  let expected: string;
  try {
    expected = macFor(affiliateId, issuedAtMs);
  } catch {
    return null;
  }
  if (macPart.length !== expected.length) return null;
  const a = new Uint8Array(Buffer.from(macPart, "utf8"));
  const b = new Uint8Array(Buffer.from(expected, "utf8"));
  const ok = timingSafeEqual(a, b);
  return ok ? { affiliateId } : null;
}

/**
 * Mint the absolute unsubscribe URL embedded in affiliate emails. We accept
 * `baseUrl` as a parameter rather than reading env at call time so tests
 * stay deterministic.
 */
export function buildAffiliateUnsubscribeUrl(
  baseUrl: string,
  affiliateId: number
): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/api/affiliates/unsubscribe?token=${encodeURIComponent(
    mintAffiliateUnsubscribeToken(affiliateId)
  )}`;
}
