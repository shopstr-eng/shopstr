import { useEffect } from "react";
import { useRouter } from "next/router";

const COOKIE_NAME = "mm_aff_ref";
const COOKIE_DAYS = 30;
const MAX_ENTRIES = 32;
// One sessionStorage marker per (seller, code) pair so a refresh inside the
// same tab session doesn't double-count the click. We accept that opening a
// link in a new tab counts twice — that's the same trade-off Plausible et al
// make and avoids server-side dedupe on a public, unauthenticated endpoint.
const SESSION_KEY = "mm_aff_clicks_recorded";

type RefMap = Record<string, string>;

function readMap(): RefMap {
  if (typeof document === "undefined") return {};
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`)
  );
  if (!match) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]!));
    if (parsed && typeof parsed === "object") return parsed as RefMap;
  } catch {
    // legacy cookies stored a bare string under the "*" wildcard slot
    return { "*": decodeURIComponent(match[1]!) };
  }
  return {};
}

function writeMap(map: RefMap) {
  if (typeof document === "undefined") return;
  const max = COOKIE_DAYS * 24 * 60 * 60;
  const value = encodeURIComponent(JSON.stringify(map));
  document.cookie = `${COOKIE_NAME}=${value}; max-age=${max}; path=/; SameSite=Lax`;
}

/**
 * Bind the current `?ref=CODE` from the cookie (per-seller or wildcard) to a
 * newly-known seller pubkey. Used by pages that resolve their seller after
 * the URL has been processed (e.g. /listing/[id], where the product's pubkey
 * is only known once the matching event is found).
 *
 * Fires a one-time `record-click` for that (seller, code) pair so analytics
 * attribution lines up with the actual seller, not the wildcard slot.
 */
export function bindAffiliateRefToSeller(
  sellerPubkey: string | null | undefined,
  landingPath?: string | null
): void {
  if (typeof document === "undefined") return;
  if (
    !sellerPubkey ||
    typeof sellerPubkey !== "string" ||
    !/^[0-9a-f]{64}$/i.test(sellerPubkey)
  ) {
    return;
  }
  const normalizedSeller = sellerPubkey.toLowerCase();
  const map = readMap();
  const existing = map[normalizedSeller] ?? map["*"];
  if (!existing) return;
  // Already bound — nothing to do.
  if (map[normalizedSeller] === existing) {
    // Still fire click record once per session for analytics.
  } else {
    setRefForSeller(existing, normalizedSeller);
  }
  try {
    const marker = `${normalizedSeller}:${existing}`;
    const seen =
      typeof window !== "undefined" && window.sessionStorage
        ? window.sessionStorage.getItem(SESSION_KEY)
        : null;
    const seenSet = new Set(seen ? seen.split("|") : []);
    if (seenSet.has(marker)) return;
    seenSet.add(marker);
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.setItem(
        SESSION_KEY,
        Array.from(seenSet).slice(-64).join("|")
      );
    }
    void fetch("/api/affiliates/record-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sellerPubkey: normalizedSeller,
        code: existing,
        landingPath: (landingPath ?? "").slice(0, 512) || null,
      }),
      keepalive: true,
    }).catch(() => {
      // best-effort; don't surface analytics errors to the user
    });
  } catch {
    // sessionStorage unavailable; skip silently.
  }
}

function setRefForSeller(code: string, sellerPubkey: string | null) {
  const map = readMap();
  const key = sellerPubkey || "*";
  map[key] = code;
  // bound map size so a malicious site can't fill the cookie
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete map[k];
  }
  writeMap(map);
}

/**
 * Returns the most appropriate stored affiliate code for a given seller. We
 * prefer a per-seller binding over the wildcard fallback so that a code set
 * on seller A's product page does not get applied at seller B's checkout.
 */
export function getAffiliateRefCookie(
  sellerPubkey?: string | null
): string | null {
  const map = readMap();
  if (sellerPubkey && map[sellerPubkey]) return map[sellerPubkey] ?? null;
  return map["*"] ?? null;
}

function resolveFallbackSeller(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored =
      window.sessionStorage?.getItem("sf_seller_pubkey") ||
      window.localStorage?.getItem("sf_seller_pubkey");
    if (stored && /^[0-9a-f]{64}$/i.test(stored)) return stored.toLowerCase();
  } catch {
    // storage unavailable; ignore
  }
  return null;
}

interface AffiliateRefTrackerProps {
  /**
   * Pubkey of the storefront the viewer is currently on (custom domain or
   * /stall/[slug]). When provided, a `?ref=CODE` without an explicit
   * `ref_seller` will be auto-bound to this seller, so codes set up in the
   * seller's settings apply on their own stall + custom domain — not just the
   * generic marketplace.
   */
  storefrontPubkey?: string | null;
}

/**
 * Listens for `?ref=CODE` on every route change and stashes the value in a
 * 30-day cookie. If `?ref_seller=PUBKEY` is also present we bind the code to
 * that seller; otherwise we fall back to the active storefront pubkey (when
 * the viewer is on a custom domain or /stall/* route) and finally to the
 * wildcard slot.
 */
export default function AffiliateRefTracker({
  storefrontPubkey,
}: AffiliateRefTrackerProps = {}) {
  const router = useRouter();
  useEffect(() => {
    const code = router.query.ref;
    const sellerRaw = router.query.ref_seller;
    if (typeof code !== "string" || code.length === 0 || code.length >= 256) {
      return;
    }
    const explicitSeller =
      typeof sellerRaw === "string" && /^[0-9a-f]{64}$/i.test(sellerRaw)
        ? sellerRaw.toLowerCase()
        : null;
    const storefrontSeller =
      typeof storefrontPubkey === "string" &&
      /^[0-9a-f]{64}$/i.test(storefrontPubkey)
        ? storefrontPubkey.toLowerCase()
        : null;
    const seller =
      explicitSeller || storefrontSeller || resolveFallbackSeller();
    const trimmed = code.trim();
    setRefForSeller(trimmed, seller);

    // Fire-and-forget click record. Only run when we know which seller the
    // code belongs to — `record-click` requires a sellerPubkey for scoping.
    if (!seller) return;
    try {
      const marker = `${seller}:${trimmed}`;
      const seen =
        typeof window !== "undefined" && window.sessionStorage
          ? window.sessionStorage.getItem(SESSION_KEY)
          : null;
      const seenSet = new Set(seen ? seen.split("|") : []);
      if (seenSet.has(marker)) return;
      seenSet.add(marker);
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(
          SESSION_KEY,
          Array.from(seenSet).slice(-64).join("|")
        );
      }
      void fetch("/api/affiliates/record-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerPubkey: seller,
          code: trimmed,
          landingPath: router.asPath?.slice(0, 512) ?? null,
        }),
        keepalive: true,
      }).catch(() => {
        // best-effort; don't surface analytics errors to the user
      });
    } catch {
      // sessionStorage unavailable (Safari private mode, etc); skip silently.
    }
  }, [router.query.ref, router.query.ref_seller, router.asPath]);
  return null;
}
