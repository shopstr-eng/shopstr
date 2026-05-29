import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { NostrEvent, ProfileData, ShopProfile } from "@/utils/types/types";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import { nip19 } from "nostr-tools";
import {
  findProductBySlug,
  getListingSlug,
  isNpub,
  findPubkeyByProfileSlug,
  getProfileSlug,
} from "@/utils/url-slugs";
import { OgMetaProps, DEFAULT_OG } from "@/components/og-head";

type MetaTagsType = {
  title: string;
  description: string;
  image: string;
  url: string;
};

const BASE_URL = "https://milk.market";

function ensureAbsoluteUrl(url: string, base: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

const STATIC_PAGE_META: Record<string, { title: string; description: string }> =
  {
    "/about": {
      title: "About Milk Market | Bitcoin-Native Nostr Marketplace",
      description:
        "Milk Market is a global, permissionless marketplace built on the Nostr protocol. Learn about our mission to enable censorship-resistant Bitcoin commerce worldwide.",
    },
    "/contact": {
      title: "Contact Milk Market | Get in Touch via Nostr & GitHub",
      description:
        "Contact the Milk Market team via Nostr, GitHub, or X. We are a decentralized open-source project — all communication happens on open protocols.",
    },
    "/faq": {
      title: "FAQ | Milk Market — Bitcoin Nostr Marketplace Help",
      description:
        "Answers to common questions about Milk Market — the permissionless Bitcoin marketplace on Nostr. Learn about payments, Lightning Network, selling, privacy, and more.",
    },
  };

const getMetaTags = (
  canonicalOrigin: string,
  pathname: string,
  asPath: string,
  query: { productId?: string[]; npub?: string[] },
  productEvents: NostrEvent[],
  shopEvents: Map<string, ShopProfile>,
  profileData: Map<string, ProfileData>
): MetaTagsType => {
  // Strip query string and hash from asPath so the canonical is the bare page
  // URL (Lighthouse flags canonicals pointing to "/" for non-root pages, and
  // we don't want tracking params in canonicals). Canonical URL must always
  // point to the production domain (canonicalOrigin), regardless of which
  // host the page is currently being served from (e.g. a *.replit.app preview).
  const cleanPath = (asPath || "/").split("?")[0]!.split("#")[0] || "/";
  const defaultTags = {
    title: DEFAULT_OG.title,
    description: DEFAULT_OG.description,
    image: ensureAbsoluteUrl("/milk-market.png", canonicalOrigin),
    url: `${canonicalOrigin}${cleanPath === "/" ? "" : cleanPath}`,
  };

  const staticMeta = STATIC_PAGE_META[pathname];
  if (staticMeta) {
    return {
      ...defaultTags,
      title: staticMeta.title,
      description: staticMeta.description,
    };
  }

  if (pathname.startsWith("/listing/")) {
    const productId = query.productId?.[0];
    if (!productId) return defaultTags;

    const allParsed = productEvents
      .filter((e) => e.kind !== 1)
      .map((e) => parseTags(e))
      .filter((p): p is ProductData => !!p);

    let productData: ProductData | undefined;

    productData = findProductBySlug(productId, allParsed);

    if (!productData) {
      const product = productEvents.find((event) => {
        const naddrMatch = (() => {
          try {
            return (
              nip19.naddrEncode({
                identifier:
                  event.tags.find((tag: string[]) => tag[0] === "d")?.[1] || "",
                pubkey: event.pubkey,
                kind: event.kind,
              }) === productId
            );
          } catch {
            return false;
          }
        })();
        const dTagMatch =
          event.tags.find((tag: string[]) => tag[0] === "d")?.[1] === productId;
        const idMatch = event.id === productId;
        return naddrMatch || dTagMatch || idMatch;
      });
      if (product) {
        productData = parseTags(product);
      }
    }

    if (productData) {
      const slug = getListingSlug(productData, allParsed);
      return {
        title: productData.title || "Milk Market Listing",
        description:
          productData.summary || "Check out this product on Milk Market!",
        image: ensureAbsoluteUrl(
          productData.images?.[0] || "/milk-market.png",
          canonicalOrigin
        ),
        url: `${canonicalOrigin}/listing/${slug || productId}`,
      };
    }

    return {
      ...defaultTags,
      title: "Milk Market Listing",
      description: "Check out this listing on Milk Market!",
    };
  } else if (pathname.startsWith("/marketplace/") && query.npub?.[0]) {
    const slug = query.npub[0];
    let shopInfo: ShopProfile | undefined;

    if (isNpub(slug)) {
      shopInfo = Array.from(shopEvents.values()).find(
        (event) => nip19.npubEncode(event.pubkey) === slug
      );
    } else {
      const pubkey = findPubkeyByProfileSlug(slug, profileData);
      if (pubkey) {
        shopInfo = shopEvents.get(pubkey);
      }
    }

    if (shopInfo) {
      const profileSlug = getProfileSlug(shopInfo.pubkey, profileData);
      return {
        title: `${shopInfo.content.name} Stall` || "Milk Market Stall",
        description:
          shopInfo.content.about || "Check out this shop on Milk Market!",
        image: ensureAbsoluteUrl(
          shopInfo.content.ui.picture || "/milk-market.png",
          canonicalOrigin
        ),
        url: `${canonicalOrigin}/marketplace/${profileSlug}`,
      };
    }
    return {
      ...defaultTags,
      title: "Milk Market Stall",
      description: "Check out this shop on Milk Market!",
    };
  }

  return defaultTags;
};

const DynamicHead = ({
  productEvents,
  shopEvents,
  profileData,
  ssrOgMeta,
  isCustomDomain,
  customDomainShopPubkey,
}: {
  productEvents: NostrEvent[];
  shopEvents: Map<string, ShopProfile>;
  profileData: Map<string, ProfileData>;
  ssrOgMeta?: OgMetaProps | null;
  isCustomDomain?: boolean;
  customDomainShopPubkey?: string | null;
}) => {
  const router = useRouter();
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Canonical/og:url should always point to the production domain
  // (https://milk.market) regardless of which origin (replit.app preview,
  // localhost, etc.) the page was actually served from. Lighthouse flags
  // mismatched/cross-origin canonicals as conflicting otherwise.
  const canonicalOrigin = BASE_URL;
  // Display origin (used only for the twitter:domain meta) can fall back
  // to the live request origin when available.
  const displayOrigin = origin || BASE_URL;

  const metaTags = ssrOgMeta
    ? {
        title: ssrOgMeta.title,
        description: ssrOgMeta.description,
        image: ensureAbsoluteUrl(ssrOgMeta.image, canonicalOrigin),
        url: ensureAbsoluteUrl(ssrOgMeta.url, canonicalOrigin),
      }
    : getMetaTags(
        canonicalOrigin,
        router.pathname,
        router.asPath,
        router.query,
        productEvents,
        shopEvents,
        profileData
      );

  // For custom stalls and custom domains, prefer the seller's storefront logo
  // as the browser tab favicon (and apple-touch-icon) so the tab matches their
  // brand instead of showing the Milk Market icon.
  //
  // The SSR favicon (from getServerSideProps' ogMeta) is used first so that
  // search-engine crawlers and social-preview bots — which don't run the
  // client-side Nostr fetches — see the seller's icon in the initial HTML.
  // The client-side custom-domain logo is a fallback for routes without SSR
  // ogMeta (e.g. rewritten /listing or /cart pages on a custom domain).
  const ssrFavicon = ssrOgMeta?.favicon
    ? ensureAbsoluteUrl(ssrOgMeta.favicon, canonicalOrigin)
    : "";
  const customDomainShopLogo =
    isCustomDomain && customDomainShopPubkey
      ? shopEvents.get(customDomainShopPubkey)?.content?.ui?.picture ||
        profileData.get(customDomainShopPubkey)?.content?.picture ||
        ""
      : "";
  const faviconUrl = ssrFavicon || customDomainShopLogo || "/milk-market.ico";
  const appleTouchIconUrl =
    ssrFavicon || customDomainShopLogo || "/milk-market.png";

  // OG/Twitter facets that describe the storefront itself. When SSR ogMeta is
  // present (custom stalls + custom domains) these come from the seller's
  // storefront settings so the social preview reflects the stall, not the
  // platform defaults.
  const ogType = ssrOgMeta?.type || "website";
  const ogSiteName = ssrOgMeta?.siteName || "Milk Market";
  const ogLocale = ssrOgMeta?.locale || "en_US";
  const keywords =
    ssrOgMeta?.keywords ||
    "milk market, raw dairy, farm-fresh dairy, nostr marketplace, bitcoin payments, lightning network, cashu, peer-to-peer commerce, local farmers, raw milk";
  const geoRegion = ssrOgMeta?.locationRegion || "";
  const geoCity = ssrOgMeta?.locationCity || "";
  const geoPlaceName = [geoCity, geoRegion].filter(Boolean).join(", ");

  return (
    <Head>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1"
      />
      <title>{metaTags.title}</title>
      <meta name="description" content={metaTags.description} />
      <link rel="canonical" href={metaTags.url} key="canonical" />
      <link rel="icon" key="favicon" href={faviconUrl} />
      <link
        rel="apple-touch-icon"
        key="apple-touch-icon"
        href={appleTouchIconUrl}
      />
      <link
        rel="apple-touch-icon"
        key="apple-touch-icon-152"
        sizes="152x152"
        href={appleTouchIconUrl}
      />
      <link
        rel="apple-touch-icon"
        key="apple-touch-icon-180"
        sizes="180x180"
        href={appleTouchIconUrl}
      />
      <meta property="og:url" content={metaTags.url} key="og:url" />
      <meta property="og:type" content={ogType} key="og:type" />
      <meta property="og:title" content={metaTags.title} key="og:title" />
      <meta
        property="og:description"
        content={metaTags.description}
        key="og:description"
      />
      <meta property="og:image" content={metaTags.image} key="og:image" />
      <meta property="og:site_name" content={ogSiteName} key="og:site_name" />
      <meta property="og:locale" content={ogLocale} key="og:locale" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta
        property="twitter:domain"
        content={
          displayOrigin.replace(/^https?:\/\//, "").split("/")[0] ||
          "milk.market"
        }
      />
      <meta property="twitter:url" content={metaTags.url} />
      <meta name="twitter:title" content={metaTags.title} />
      <meta name="twitter:description" content={metaTags.description} />
      <meta name="twitter:image" content={metaTags.image} />
      <meta name="keywords" content={keywords} key="keywords" />
      {geoRegion && (
        <meta name="geo.region" content={geoRegion} key="geo.region" />
      )}
      {geoCity && (
        <meta name="geo.placename" content={geoCity} key="geo.placename" />
      )}
      {geoPlaceName && (
        <meta property="og:locality" content={geoPlaceName} key="og:locality" />
      )}
    </Head>
  );
};

export default DynamicHead;
