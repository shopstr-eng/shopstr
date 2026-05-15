type CacheEntry = {
  slug: string | null;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const TTL_MS = 60 * 1000;
const NEGATIVE_TTL_MS = 30 * 1000;

export function getCachedSlug(host: string): string | null | undefined {
  const e = cache.get(host);
  if (!e) return undefined;
  if (e.expiresAt < Date.now()) {
    cache.delete(host);
    return undefined;
  }
  return e.slug;
}

export function setCachedSlug(host: string, slug: string | null): void {
  cache.set(host, {
    slug,
    expiresAt: Date.now() + (slug ? TTL_MS : NEGATIVE_TTL_MS),
  });
}

export async function lookupSlugByHost(
  origin: string,
  host: string
): Promise<string | null> {
  const cached = getCachedSlug(host);
  if (cached !== undefined) return cached;
  try {
    const r = await fetch(
      `${origin}/api/storefront/lookup?domain=${encodeURIComponent(host)}`,
      { headers: { "x-internal-lookup": "1" } }
    );
    if (!r.ok) {
      setCachedSlug(host, null);
      return null;
    }
    const data = (await r.json()) as { shopSlug?: string };
    const slug = data?.shopSlug ?? null;
    setCachedSlug(host, slug);
    return slug;
  } catch {
    setCachedSlug(host, null);
    return null;
  }
}
