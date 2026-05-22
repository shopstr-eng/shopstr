import { fetchShopProfileByPubkeyFromDb } from "@/utils/db/db-service";
import { FlowEmailStorefrontStyle } from "./flow-email-templates";

export interface StorefrontBranding {
  shopName?: string;
  style?: FlowEmailStorefrontStyle;
}

// Per-process cache with TTL so seller branding edits land within a reasonable
// window without re-hammering the DB on every transactional email.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<
  string,
  { value: StorefrontBranding | null; expiresAt: number }
>();

export function clearStorefrontBrandingCache(): void {
  cache.clear();
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function sanitizeHex(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return HEX_RE.test(v) ? v : undefined;
}

export async function loadStorefrontBranding(
  sellerPubkey: string | null | undefined
): Promise<StorefrontBranding | null> {
  if (!sellerPubkey) return null;
  const cached = cache.get(sellerPubkey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  try {
    const evt = await fetchShopProfileByPubkeyFromDb(sellerPubkey);
    if (!evt?.content) {
      cache.set(sellerPubkey, { value: null, expiresAt: now + TTL_MS });
      return null;
    }
    const parsed = JSON.parse(evt.content);
    const sf = parsed?.storefront;
    const cs = sf?.colorScheme;

    const rawName =
      typeof parsed?.name === "string" && parsed.name.trim()
        ? parsed.name.trim()
        : typeof parsed?.display_name === "string" && parsed.display_name.trim()
          ? parsed.display_name.trim()
          : undefined;
    // Strip control chars and cap length so it remains a valid SendGrid From
    // display name and doesn't blow up email headers.
    const shopName = rawName
      ? rawName
          .replace(/[\r\n\t\u0000-\u001F]/g, " ")
          .slice(0, 78)
          .trim() || undefined
      : undefined;

    let style: FlowEmailStorefrontStyle | undefined;
    if (cs || sf?.neoShadows) {
      const primary = sanitizeHex(cs?.primary);
      const secondary = sanitizeHex(cs?.secondary);
      const accent = sanitizeHex(cs?.accent);
      const background = sanitizeHex(cs?.background);
      const text = sanitizeHex(cs?.text);
      if (
        primary ||
        secondary ||
        accent ||
        background ||
        text ||
        sf?.neoShadows
      ) {
        style = {
          primary,
          secondary,
          accent,
          background,
          text,
          neoShadows: !!sf?.neoShadows,
        };
      }
    }

    if (!shopName && !style) {
      cache.set(sellerPubkey, { value: null, expiresAt: now + TTL_MS });
      return null;
    }
    const branding: StorefrontBranding = { shopName, style };
    cache.set(sellerPubkey, { value: branding, expiresAt: now + TTL_MS });
    return branding;
  } catch (err) {
    console.error(
      "Failed to load storefront branding for email:",
      sellerPubkey,
      err
    );
    cache.set(sellerPubkey, { value: null, expiresAt: now + TTL_MS });
    return null;
  }
}
