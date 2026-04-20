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

/**
 * Listens for `?ref=CODE` on every route change and stashes the value in a
 * 30-day cookie. If `?ref_seller=PUBKEY` is also present we bind the code to
 * that seller; otherwise we store under the wildcard slot.
 */
export default function AffiliateRefTracker() {
  const router = useRouter();
  useEffect(() => {
    const code = router.query.ref;
    const sellerRaw = router.query.ref_seller;
    if (typeof code !== "string" || code.length === 0 || code.length >= 256) {
      return;
    }
    const seller =
      typeof sellerRaw === "string" && /^[0-9a-f]{64}$/i.test(sellerRaw)
        ? sellerRaw.toLowerCase()
        : null;
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
