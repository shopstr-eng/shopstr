export type HostResolution = {
  slug: string | null;
  pubkey: string | null;
};

type CacheEntry = {
  value: HostResolution;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const TTL_MS = 60 * 1000;
const NEGATIVE_TTL_MS = 30 * 1000;

function getCached(host: string): HostResolution | undefined {
  const e = cache.get(host);
  if (!e) return undefined;
  if (e.expiresAt < Date.now()) {
    cache.delete(host);
    return undefined;
  }
  return e.value;
}

function setCached(host: string, value: HostResolution): void {
  cache.set(host, {
    value,
    expiresAt: Date.now() + (value.slug ? TTL_MS : NEGATIVE_TTL_MS),
  });
}

// Backwards-compatible shims — existing callers expect a slug-only API.
export function getCachedSlug(host: string): string | null | undefined {
  const v = getCached(host);
  return v ? v.slug : undefined;
}

export function setCachedSlug(host: string, slug: string | null): void {
  setCached(host, { slug, pubkey: null });
}

export async function lookupSlugByHost(
  origin: string,
  host: string
): Promise<string | null> {
  const v = await lookupByHost(origin, host);
  return v.slug;
}

/**
 * Canonical platform origin used for the edge-runtime lookup.
 *
 * The proxy runs at the edge on every request, including requests that
 * arrive at a seller's custom domain (e.g. https://naughtygoat.co). If we
 * naively used `request.nextUrl.origin` as the lookup origin, the edge
 * worker would call `https://naughtygoat.co/api/storefront/lookup?...`,
 * looping back out through DNS + TLS into the same edge. On Vercel / Replit
 * this either times out or fails the TLS handshake silently — `fetch`
 * rejects, the surrounding try/catch swallows the error, and `lookupByHost`
 * returns `{ slug: null }`. The proxy then rewrites to `/stall/_custom-domain`
 * and the visitor sees a "Domain Not Configured" placeholder even though
 * the row exists and is verified.
 *
 * Always talking to the platform host avoids the loop entirely. Override
 * with MM_LOOKUP_ORIGIN in non-prod (e.g. preview deployments) if needed.
 */
const PLATFORM_LOOKUP_ORIGIN =
  process.env.MM_LOOKUP_ORIGIN ?? "https://milk.market";

/**
 * Resolve a host to both its shop slug and the seller's pubkey in one
 * round-trip. The proxy uses this to inject `x-mm-shop-pubkey` so the
 * client can seed `storefrontLoadPubkey` from SSR and skip the
 * "mount-bare, fetch slug, then remount inside StorefrontThemeWrapper"
 * race that blanked Safari sessions.
 *
 * The first argument is ignored — we always hit the canonical platform
 * origin (see PLATFORM_LOOKUP_ORIGIN). The signature is preserved for
 * backwards compatibility with proxy.ts.
 */
export async function lookupByHost(
  _requestOrigin: string,
  host: string
): Promise<HostResolution> {
  const cached = getCached(host);
  if (cached !== undefined) return cached;
  try {
    const r = await fetch(
      `${PLATFORM_LOOKUP_ORIGIN}/api/storefront/lookup?domain=${encodeURIComponent(host)}`,
      { headers: { "x-internal-lookup": "1" } }
    );
    if (!r.ok) {
      const empty: HostResolution = { slug: null, pubkey: null };
      setCached(host, empty);
      return empty;
    }
    // The lookup API has shipped two response shapes across branches:
    // `{ shopSlug, pubkey }` and `{ slug, pubkey }`. Accept either so this
    // file works regardless of which lookup.ts is currently deployed.
    const data = (await r.json()) as {
      shopSlug?: string;
      slug?: string;
      pubkey?: string;
    };
    const resolution: HostResolution = {
      slug: data?.shopSlug ?? data?.slug ?? null,
      pubkey: data?.pubkey ?? null,
    };
    setCached(host, resolution);
    return resolution;
  } catch {
    const empty: HostResolution = { slug: null, pubkey: null };
    setCached(host, empty);
    return empty;
  }
}
