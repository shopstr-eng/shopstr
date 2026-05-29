import type { OgMetaProps } from "@/components/og-head";

type StorefrontSeoMeta = {
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  keywords?: string;
  locale?: string;
  locationRegion?: string;
  locationCity?: string;
};

type ShopContent = {
  name?: string;
  about?: string;
  ui?: { picture?: string; banner?: string };
  storefront?: { seoMeta?: StorefrontSeoMeta };
};

type ProfileContent = {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
};

export type ResolvedStallBranding = {
  /** Stall name → user (Nostr profile) name → "Stall". */
  shopName: string;
  /** Stall about → user (Nostr profile) about → "". */
  about: string;
  /**
   * OG/preview image. Custom (seoMeta.ogImage) → stall banner → stall icon →
   * user icon → Milk Market default.
   */
  image: string;
  /**
   * Browser-tab favicon. Stall icon → user icon → "" (empty means the
   * consumer should fall back to the Milk Market default icon). There is no
   * custom favicon field in stall settings, so nothing supersedes the stall
   * icon here.
   */
  favicon: string;
  seo: StorefrontSeoMeta | undefined;
};

/**
 * Resolve a stall's branding values following the fallback hierarchy:
 * custom stall settings (where applicable) → stall icon/info → user (Nostr
 * profile) icon/info → Milk Market default.
 *
 * The resolved values are used for both the favicon and the OG/preview meta
 * tags so they render in the server HTML and are picked up by search engines
 * and social-preview bots.
 */
export function resolveStallBranding(
  shopContent: ShopContent | null | undefined,
  profileContent: ProfileContent | null | undefined
): ResolvedStallBranding {
  const seo = shopContent?.storefront?.seoMeta;

  const stallName = shopContent?.name || "";
  const userName = profileContent?.display_name || profileContent?.name || "";
  const shopName = stallName || userName || "Stall";

  const stallAbout = shopContent?.about || "";
  const userAbout = profileContent?.about || "";
  const about = stallAbout || userAbout;

  const stallIcon = shopContent?.ui?.picture || "";
  const stallBanner = shopContent?.ui?.banner || "";
  const userIcon = profileContent?.picture || "";

  const favicon = stallIcon || userIcon || "";
  const image =
    seo?.ogImage || stallBanner || stallIcon || userIcon || "/milk-market.png";

  return { shopName, about, image, favicon, seo };
}

/**
 * Build the `ogMeta` object for a stall page from resolved branding. Each
 * caller supplies the page-specific `url` and `title` (titles differ between
 * the stall landing page and its sub-pages), and a keyword seed slug.
 */
export function buildStallOgMeta(params: {
  branding: ResolvedStallBranding;
  title: string;
  url: string;
  keywordSeed: string;
}): OgMetaProps {
  const { branding, title, url, keywordSeed } = params;
  const { shopName, about, image, favicon, seo } = branding;

  const description = seo?.metaDescription
    ? seo.metaDescription
    : about
      ? about.length > 160
        ? about.slice(0, 157) + "..."
        : about
      : `Shop farm-fresh products from ${shopName} on Milk Market. Direct from the producer to your door.`;

  return {
    title,
    description,
    image,
    ...(favicon ? { favicon } : {}),
    url,
    keywords:
      seo?.keywords ||
      `${shopName}, farm fresh, raw milk, dairy, local farm, ${keywordSeed}`,
    locale: seo?.locale || "en_US",
    ...(seo?.locationRegion ? { locationRegion: seo.locationRegion } : {}),
    ...(seo?.locationCity ? { locationCity: seo.locationCity } : {}),
    siteName: shopName,
    type: "business.business",
  };
}
