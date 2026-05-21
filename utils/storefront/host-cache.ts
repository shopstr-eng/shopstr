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
 * Resolve a host to both its shop slug and the seller's pubkey in one
 * round-trip. Middleware uses this to inject `x-mm-shop-pubkey` so the
 * client can seed `storefrontLoadPubkey` from SSR and skip the
 * "mount-bare, fetch slug, then remount inside StorefrontThemeWrapper"
 * race that blanked Safari sessions.
 */
export async function lookupByHost(
  origin: string,
  host: string
): Promise<HostResolution> {
  const cached = getCached(host);
  if (cached !== undefined) return cached;
  try {
    const r = await fetch(
      `${origin}/api/storefront/lookup?domain=${encodeURIComponent(host)}`,
      { headers: { "x-internal-lookup": "1" } }
    );
    if (!r.ok) {
      const empty: HostResolution = { slug: null, pubkey: null };
      setCached(host, empty);
      return empty;
    }
    const data = (await r.json()) as {
      shopSlug?: string;
      pubkey?: string;
    };
    const resolution: HostResolution = {
      slug: data?.shopSlug ?? null,
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
