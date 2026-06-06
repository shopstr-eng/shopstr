import { useContext, useEffect, useState, useMemo } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useDisclosure } from "@heroui/react";
import {
  ShoppingCartIcon,
  Bars3Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  ShopMapContext,
  ProductContext,
  ProfileMapContext,
  ReviewsContext,
  CommunityContext,
} from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { ProfileWithDropdown } from "@/components/utility-components/profile/profile-dropdown";
import SignInModal from "@/components/sign-in/SignInModal";
import {
  ShopProfile,
  StorefrontConfig,
  StorefrontColorScheme,
  StorefrontNavLink,
  StorefrontFooter,
} from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import parseTags from "@/utils/parsers/product-parser-functions";
import Link from "next/link";
import StorefrontProductGrid from "./storefront-product-grid";
import SectionRenderer from "./section-renderer";
import FormattedText from "./formatted-text";
import StorefrontFooterComponent from "./storefront-footer";
import StorefrontCommunity from "./storefront-community";
import StorefrontOrders from "./storefront-orders";
import StorefrontWallet from "./storefront-wallet";
import StorefrontMyListings from "./storefront-my-listings";
import StorefrontShopPage from "./storefront-shop-page";
import StorefrontOrderConfirmation from "./storefront-order-confirmation";
import StorefrontPolicyPage from "./storefront-policy-page";
import StorefrontEmailPopupComponent from "./storefront-email-popup";
import { POLICY_SLUGS, getDefaultPolicies } from "@/utils/storefront-policies";
import { StorefrontPolicies } from "@/utils/types/types";
import {
  isExternalStorefrontHref,
  sanitizeStorefrontNavHref,
} from "@/utils/storefront-links";
import { getStorefrontCartQuantity } from "@/utils/storefront-cart";
import {
  applyCustomDomainHref,
  useIsCustomDomain,
} from "@/utils/storefront/custom-domain-context";

const DEFAULT_COLORS: StorefrontColorScheme = {
  primary: "#FFD23F",
  secondary: "#1E293B",
  accent: "#3B82F6",
  background: "#FFFFFF",
  text: "#000000",
};

// A lapsed (read-only/hidden) or non-Pro seller keeps only identity/routing —
// never the premium styling (custom colors, fonts, page-builder sections/pages,
// nav/footer, popups, custom SEO). The design is published to Nostr with no
// server write path to block, so this strip is the render-layer enforcement of
// the Pro entitlement.
function basicStorefront(sf: StorefrontConfig): StorefrontConfig {
  return {
    shopSlug: sf.shopSlug,
    customDomain: sf.customDomain,
  };
}

const GOOGLE_FONT_OPTIONS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Playfair Display",
  "Merriweather",
  "Raleway",
  "Nunito",
  "Oswald",
  "Source Sans 3",
  "PT Serif",
  "Bitter",
  "Crimson Text",
];

interface StorefrontLayoutProps {
  shopPubkey: string;
  currentPage?: string;
}

export default function StorefrontLayout({
  shopPubkey,
  currentPage,
}: StorefrontLayoutProps) {
  const shopMapContext = useContext(ShopMapContext);
  const productContext = useContext(ProductContext);
  const profileContext = useContext(ProfileMapContext);
  const reviewsContext = useContext(ReviewsContext);
  const communityContext = useContext(CommunityContext);
  const { isLoggedIn, pubkey: userPubkey } = useContext(SignerContext);
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const isCustomDomain = useIsCustomDomain();

  const [shop, setShop] = useState<ShopProfile | undefined>();
  const [storefront, setStorefront] = useState<StorefrontConfig>({});
  const [colors, setColors] = useState<StorefrontColorScheme>(DEFAULT_COLORS);
  const [cartQuantity, setCartQuantity] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [shopDataReady, setShopDataReady] = useState(false);
  // The viewed seller's Pro entitlement, scoped to the pubkey it was resolved
  // for. We key on pubkey so a stale `true` from a previously-viewed Pro seller
  // can never be applied to a different (non-Pro) seller during a client-side
  // shop switch. Premium styling is only served when the resolved pubkey
  // matches the current seller AND isPro is true; we fail closed (false) on any
  // error so a lapsed seller's design is never served during a status outage.
  const [proStatus, setProStatus] = useState<{
    pubkey: string;
    isPro: boolean;
  } | null>(null);

  useEffect(() => {
    if (!shopPubkey) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/pro/status?pubkey=${encodeURIComponent(shopPubkey)}`
        );
        if (cancelled) return;
        if (res.ok) {
          const view = await res.json();
          setProStatus({ pubkey: shopPubkey, isPro: !!view?.isPro });
        } else {
          setProStatus({ pubkey: shopPubkey, isPro: false });
        }
      } catch {
        if (!cancelled) setProStatus({ pubkey: shopPubkey, isPro: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopPubkey]);

  // Entitlement only counts when it was resolved for the seller we're rendering.
  // While unresolved or stale (different pubkey), this is false → fail closed.
  const proEntitled =
    proStatus !== null && proStatus.pubkey === shopPubkey
      ? proStatus.isPro
      : null;

  useEffect(() => {
    if (shopPubkey && shopMapContext.shopData.has(shopPubkey)) {
      const shopData = shopMapContext.shopData.get(shopPubkey);
      if (shopData) {
        setShop(shopData);
        const sf = shopData.content.storefront;
        // Wait until entitlement resolves before serving premium styling, and
        // strip it entirely for non-Pro/lapsed sellers. The basic shop (slug,
        // products, name) still renders; only the premium design is gated.
        if (proEntitled === true && sf) {
          setStorefront(sf);
          setColors(
            sf.colorScheme
              ? { ...DEFAULT_COLORS, ...sf.colorScheme }
              : DEFAULT_COLORS
          );
        } else {
          setStorefront(sf ? basicStorefront(sf) : {});
          setColors(DEFAULT_COLORS);
        }
        setShopDataReady(true);
      }
    }
  }, [shopPubkey, shopMapContext.shopData, proEntitled]);

  useEffect(() => {
    if (!shopDataReady) return;
    document.body.classList.add("sf-active");
    const vars: Record<string, string> = {
      "--sf-primary": colors.primary,
      "--sf-secondary": colors.secondary,
      "--sf-accent": colors.accent,
      "--sf-bg": colors.background,
      "--sf-text": colors.text,
    };
    for (const [k, v] of Object.entries(vars)) {
      document.body.style.setProperty(k, v);
    }
    return () => {
      document.body.classList.remove("sf-active");
      for (const k of Object.keys(vars)) {
        document.body.style.removeProperty(k);
      }
    };
  }, [colors, shopDataReady]);

  const shopSlug = storefront.shopSlug || "";

  useEffect(() => {
    if (shopPubkey) {
      sessionStorage.setItem("sf_seller_pubkey", shopPubkey);
    }
    if (shopSlug) {
      sessionStorage.setItem("sf_shop_slug", shopSlug);
    }
  }, [shopPubkey, shopSlug]);

  useEffect(() => {
    const sync = () => {
      setCartQuantity(getStorefrontCartQuantity(shopPubkey));
    };
    sync();
    const interval = setInterval(sync, 1000);
    return () => clearInterval(interval);
  }, [shopPubkey]);

  const sellerProducts = useMemo(() => {
    if (!shopPubkey || !productContext.productEvents.length) return [];
    return productContext.productEvents
      .filter((event: any) => event.pubkey === shopPubkey)
      .map((event: any) => parseTags(event))
      .filter((p: ProductData | undefined) => p !== undefined) as ProductData[];
  }, [shopPubkey, productContext.productEvents]);

  const profile = profileContext.profileData.get(shopPubkey);
  const shopName = shop?.content?.name || profile?.content?.name || "Stall";
  const shopAbout = shop?.content?.about || profile?.content?.about || "";
  const bannerUrl = shop?.content?.ui?.banner || "";
  const pictureUrl =
    shop?.content?.ui?.picture || profile?.content?.picture || "";

  const fontHeading = storefront.fontHeading || "";
  const fontBody = storefront.fontBody || "";
  const customFontHeadingUrl = storefront.customFontHeadingUrl || "";
  const customFontHeadingName = storefront.customFontHeadingName || "";
  const customFontBodyUrl = storefront.customFontBodyUrl || "";
  const customFontBodyName = storefront.customFontBodyName || "";
  const googleFontsUrl = buildGoogleFontsUrl(
    fontHeading,
    fontBody,
    customFontHeadingUrl,
    customFontBodyUrl
  );

  const getFontFormat = (url: string): string => {
    if (url.includes(".woff2")) return "woff2";
    if (url.includes(".woff")) return "woff";
    if (url.includes(".otf")) return "opentype";
    if (url.includes(".ttf")) return "truetype";
    return "woff2";
  };

  const customFontFaceCss = useMemo(() => {
    let css = "";
    if (customFontHeadingUrl) {
      const name =
        customFontHeadingName?.replace(/\.[^.]+$/, "") || "CustomHeading";
      const format = getFontFormat(customFontHeadingUrl);
      css += `@font-face { font-family: '${name}'; src: url('${customFontHeadingUrl}') format('${format}'); font-weight: 100 900; font-display: swap; }\n`;
    }
    if (customFontBodyUrl && customFontBodyUrl !== customFontHeadingUrl) {
      const name = customFontBodyName?.replace(/\.[^.]+$/, "") || "CustomBody";
      const format = getFontFormat(customFontBodyUrl);
      css += `@font-face { font-family: '${name}'; src: url('${customFontBodyUrl}') format('${format}'); font-weight: 100 900; font-display: swap; }\n`;
    }
    return css;
  }, [
    customFontHeadingUrl,
    customFontHeadingName,
    customFontBodyUrl,
    customFontBodyName,
  ]);

  const hasSections = storefront.sections && storefront.sections.length > 0;
  const hasNav = storefront.navLinks && storefront.navLinks.length > 0;
  const hasFooter = !!storefront.footer;

  const navBg = storefront.navColors?.background || colors.secondary;
  const navText = storefront.navColors?.text || colors.background;
  const navAccent = storefront.navColors?.accent || colors.primary;

  const activeSections = useMemo(() => {
    if (currentPage && storefront.pages) {
      const page = storefront.pages.find((p) => p.slug === currentPage);
      if (page) return page.sections.filter((s) => s.enabled !== false);
    }
    if (storefront.sections) {
      return storefront.sections.filter((s) => s.enabled !== false);
    }
    return [];
  }, [currentPage, storefront.pages, storefront.sections]);

  const policyPageData = useMemo(() => {
    if (!currentPage) return null;
    const footerPolicies = storefront.footer?.policies || {};
    const defaults = getDefaultPolicies(shopName);
    const policyKeys = Object.keys(
      POLICY_SLUGS
    ) as (keyof StorefrontPolicies)[];
    const matchedKey = policyKeys.find((k) => POLICY_SLUGS[k] === currentPage);
    if (!matchedKey) return null;
    const policy = footerPolicies[matchedKey] || defaults[matchedKey];
    if (!policy || !policy.enabled) return null;
    return policy;
  }, [currentPage, storefront.footer?.policies, shopName]);

  const layout = storefront.productLayout || "grid";
  const landingStyle = storefront.landingPageStyle || "hero";

  const merchantReviewData = reviewsContext.merchantReviewsData.get(shopPubkey);
  const reviewCount = merchantReviewData
    ? Array.from(merchantReviewData.values()).flat().length
    : 0;

  const showCommunity = !!storefront.showCommunityPage;
  const showWallet = !!storefront.showWalletPage;
  const isShopOwner = isLoggedIn && userPubkey === shopPubkey;

  const sellerCommunity = useMemo(() => {
    if (!showCommunity || !shopPubkey) return null;
    for (const c of communityContext.communities.values()) {
      if (c.pubkey === shopPubkey) return c;
    }
    return null;
  }, [showCommunity, shopPubkey, communityContext.communities]);

  const defaultNavLinks: StorefrontNavLink[] = useMemo(() => {
    let links: StorefrontNavLink[] = hasNav
      ? [...storefront.navLinks!]
      : [
          { label: "Home", href: "" },
          { label: "Shop", href: "shop", isPage: true },
        ];
    if (!isShopOwner) {
      links = links.filter(
        (l) => l.href !== "my-listings" && l.href !== "/my-listings"
      );
    }
    const alreadyHasShop = links.some(
      (l) => l.href === "shop" || l.href === "/shop"
    );
    if (!alreadyHasShop) {
      const homeIdx = links.findIndex((l) => l.href === "" || l.href === "/");
      links.splice(homeIdx + 1, 0, {
        label: "Stall",
        href: "shop",
        isPage: true,
      });
    }
    const alreadyHasOrders = links.some(
      (l) => l.href === "orders" || l.href === "/orders"
    );
    if (!alreadyHasOrders) {
      links.push({ label: "Orders", href: "orders", isPage: true });
    }
    if (isShopOwner) {
      const alreadyHasListings = links.some(
        (l) => l.href === "my-listings" || l.href === "/my-listings"
      );
      if (!alreadyHasListings) {
        links.push({ label: "My Listings", href: "my-listings", isPage: true });
      }
    }
    if (showWallet) {
      const alreadyHasWallet = links.some(
        (l) => l.href === "wallet" || l.href === "/wallet"
      );
      if (!alreadyHasWallet) {
        links.push({ label: "Wallet", href: "wallet", isPage: true });
      }
    }
    if (showCommunity) {
      const alreadyHas = links.some(
        (l) => l.href === "community" || l.href === "/community"
      );
      if (!alreadyHas) {
        links.push({ label: "Community", href: "community", isPage: true });
      }
    }
    return links;
  }, [hasNav, storefront.navLinks, showCommunity, showWallet, isShopOwner]);

  const cssVars = {
    "--sf-primary": colors.primary,
    "--sf-secondary": colors.secondary,
    "--sf-accent": colors.accent,
    "--sf-bg": colors.background,
    "--sf-text": colors.text,
  } as React.CSSProperties;

  const resolvedHeadingFont = customFontHeadingUrl
    ? `'${customFontHeadingName?.replace(/\.[^.]+$/, "") || "CustomHeading"}', 'Poppins', sans-serif`
    : fontHeading
      ? `'${fontHeading}', sans-serif`
      : "";
  const resolvedBodyFont = customFontBodyUrl
    ? `'${customFontBodyName?.replace(/\.[^.]+$/, "") || "CustomBody"}', 'Poppins', sans-serif`
    : fontBody
      ? `'${fontBody}', sans-serif`
      : "";

  const fontStyles = {
    ...(resolvedHeadingFont ? { "--font-heading": resolvedHeadingFont } : {}),
    ...(resolvedBodyFont ? { "--font-body": resolvedBodyFont } : {}),
  } as React.CSSProperties;

  const defaultFooter: StorefrontFooter = hasFooter
    ? storefront.footer!
    : { showPoweredBy: true };

  const homeHref = applyCustomDomainHref(
    shopSlug ? `/stall/${shopSlug}` : "/marketplace",
    shopSlug,
    isCustomDomain
  );

  const themedCss = `
    .sf-layout .bg-primary-yellow { background-color: var(--sf-primary) !important; }
    .sf-layout .bg-primary-blue { background-color: var(--sf-secondary) !important; }
    .sf-layout .text-primary-blue { color: var(--sf-secondary) !important; }
    .sf-layout .hover\\:text-primary-blue:hover { color: var(--sf-accent) !important; }
    .sf-layout .border-primary-yellow { border-color: var(--sf-primary) !important; }
    .sf-layout .border-black { border-color: var(--sf-secondary) !important; }
    .sf-layout .shadow-neo {
      box-shadow: 4px 4px 0 var(--sf-secondary) !important;
    }
    .sf-layout .bg-white { background-color: var(--sf-bg) !important; }
    .sf-layout .text-black { color: var(--sf-text) !important; }
    .sf-layout .text-gray-500 { color: color-mix(in srgb, var(--sf-text) 50%, transparent) !important; }
    .sf-layout .text-gray-600 { color: color-mix(in srgb, var(--sf-text) 60%, transparent) !important; }
    .sf-layout .bg-blue-100 { background-color: color-mix(in srgb, var(--sf-accent) 15%, var(--sf-bg)) !important; }
    .sf-layout .hover\\:bg-blue-200:hover { background-color: color-mix(in srgb, var(--sf-accent) 25%, var(--sf-bg)) !important; }

    ${
      storefront.neoShadows
        ? `
    .sf-layout.sf-neo .rounded-lg.border-2,
    .sf-layout.sf-neo .rounded-xl.border-2,
    .sf-layout.sf-neo .rounded-2xl.border-2,
    .sf-layout.sf-neo .rounded.border-2,
    .sf-layout.sf-neo .rounded-lg.border,
    .sf-layout.sf-neo .rounded-xl.border,
    .sf-layout.sf-neo .rounded-2xl.border,
    .sf-layout.sf-neo .rounded.border,
    .sf-layout.sf-neo img.border,
    .sf-layout.sf-neo img.border-2 {
      box-shadow: 4px 4px 0 var(--sf-secondary) !important;
    }
    .sf-layout.sf-neo .rounded-lg.border,
    .sf-layout.sf-neo .rounded-xl.border,
    .sf-layout.sf-neo .rounded-2xl.border,
    .sf-layout.sf-neo .rounded.border {
      border-width: 2px !important;
      border-color: var(--sf-secondary) !important;
    }
    `
        : ""
    }

    body.sf-active [data-overlay-container] .border-black { border-color: var(--sf-secondary) !important; }
    body.sf-active [data-overlay-container] .shadow-neo {
      box-shadow: 4px 4px 0 var(--sf-secondary) !important;
    }
    body.sf-active [data-overlay-container] .bg-white { background-color: var(--sf-bg) !important; }
    body.sf-active [data-overlay-container] .text-black { color: var(--sf-text) !important; }
    body.sf-active [data-overlay-container] .bg-primary-yellow { background-color: var(--sf-primary) !important; }
    body.sf-active [data-overlay-container] .bg-primary-blue { background-color: var(--sf-secondary) !important; }
    body.sf-active [data-overlay-container] .border-primary-yellow { border-color: var(--sf-primary) !important; }
    body.sf-active [data-overlay-container] .font-heading { font-family: var(--font-heading, inherit); }
    body.sf-active [data-overlay-container] .font-body { font-family: var(--font-body, inherit); }

    ${
      storefront.neoShadows
        ? `
    body.sf-active [data-overlay-container] .rounded-lg.border-2,
    body.sf-active [data-overlay-container] .rounded-xl.border-2,
    body.sf-active [data-overlay-container] .rounded-2xl.border-2,
    body.sf-active [data-overlay-container] .rounded.border-2,
    body.sf-active [data-overlay-container] .rounded-lg.border,
    body.sf-active [data-overlay-container] .rounded-xl.border,
    body.sf-active [data-overlay-container] .rounded-2xl.border,
    body.sf-active [data-overlay-container] .rounded.border,
    body.sf-active [data-overlay-container] img.border,
    body.sf-active [data-overlay-container] img.border-2 {
      box-shadow: 4px 4px 0 var(--sf-secondary) !important;
    }
    body.sf-active [data-overlay-container] .rounded-lg.border,
    body.sf-active [data-overlay-container] .rounded-xl.border,
    body.sf-active [data-overlay-container] .rounded-2xl.border,
    body.sf-active [data-overlay-container] .rounded.border {
      border-width: 2px !important;
      border-color: var(--sf-secondary) !important;
    }
    `
        : ""
    }
  `;

  if (!shopDataReady) {
    return null;
  }

  return (
    <>
      <Head>
        <title>{storefront.seoMeta?.metaTitle || shopName}</title>
        {storefront.seoMeta?.metaDescription && (
          <meta
            name="description"
            content={storefront.seoMeta.metaDescription}
          />
        )}
        {storefront.seoMeta?.keywords && (
          <meta name="keywords" content={storefront.seoMeta.keywords} />
        )}
        {storefront.seoMeta?.locale && (
          <meta property="og:locale" content={storefront.seoMeta.locale} />
        )}
        {storefront.seoMeta?.locationRegion && (
          <meta name="geo.region" content={storefront.seoMeta.locationRegion} />
        )}
        {storefront.seoMeta?.locationCity && (
          <meta
            name="geo.placename"
            content={storefront.seoMeta.locationCity}
          />
        )}
        <meta property="og:type" content="business.business" />
        <meta property="og:site_name" content={shopName} />
        <meta
          property="og:title"
          content={storefront.seoMeta?.metaTitle || shopName}
        />
        {storefront.seoMeta?.metaDescription && (
          <meta
            property="og:description"
            content={storefront.seoMeta.metaDescription}
          />
        )}
        {(storefront.seoMeta?.ogImage || bannerUrl || pictureUrl) && (
          <meta
            property="og:image"
            content={storefront.seoMeta?.ogImage || bannerUrl || pictureUrl}
          />
        )}
        {googleFontsUrl && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link
              rel="preconnect"
              href="https://fonts.gstatic.com"
              crossOrigin="anonymous"
            />
            <link href={googleFontsUrl} rel="stylesheet" />
          </>
        )}
        {customFontFaceCss && <style>{customFontFaceCss}</style>}
        <style>{`
          .font-heading { font-family: var(--font-heading, inherit); }
          .font-body { font-family: var(--font-body, inherit); }
          .sf-layout, .sf-layout p, .sf-layout span, .sf-layout li, .sf-layout a, .sf-layout label, .sf-layout div, .sf-layout input, .sf-layout textarea, .sf-layout select, .sf-layout button {
            font-family: var(--font-body, inherit);
          }
          .sf-layout h1, .sf-layout h2, .sf-layout h3, .sf-layout h4, .sf-layout h5, .sf-layout h6,
          .sf-layout .font-heading, .sf-layout button.font-heading {
            font-family: var(--font-heading, var(--font-body, inherit));
          }
          body.sf-active [data-overlay-container],
          body.sf-active [data-overlay-container] p,
          body.sf-active [data-overlay-container] span,
          body.sf-active [data-overlay-container] li,
          body.sf-active [data-overlay-container] a,
          body.sf-active [data-overlay-container] label,
          body.sf-active [data-overlay-container] div,
          body.sf-active [data-overlay-container] button {
            font-family: var(--font-body, inherit);
          }
          body.sf-active [data-overlay-container] h1,
          body.sf-active [data-overlay-container] h2,
          body.sf-active [data-overlay-container] h3,
          body.sf-active [data-overlay-container] h4,
          body.sf-active [data-overlay-container] h5,
          body.sf-active [data-overlay-container] h6 {
            font-family: var(--font-heading, var(--font-body, inherit));
          }
          .sf-layout h1, .sf-layout h2, .sf-layout h3, .sf-layout h4, .sf-layout h5, .sf-layout h6,
          .sf-layout p, .sf-layout span, .sf-layout li, .sf-layout a,
          .sf-layout td, .sf-layout th, .sf-layout dt, .sf-layout dd,
          .sf-layout blockquote, .sf-layout figcaption, .sf-layout label {
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
            min-width: 0;
            max-width: 100%;
            white-space: normal;
          }
          /* Flex/grid children default to min-width: auto and, inside
             items-center flex columns, size themselves to max-content of
             their text instead of the parent width. That makes long headings
             render on one line wider than the viewport. Force every flex/grid
             item inside a storefront to shrink to 0 and cap at 100% of its
             parent so the wrapping rules above can take effect. */
          .sf-layout :where(:is([class*="flex"], [class*="grid"]) > *) {
            min-width: 0;
            min-height: 0;
            max-width: 100%;
          }
          .sf-layout img, .sf-layout video, .sf-layout iframe, .sf-layout svg, .sf-layout canvas {
            max-width: 100%;
          }
          .sf-layout pre, .sf-layout code {
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            word-break: break-word;
            max-width: 100%;
          }
          /* Hard viewport clamp: nothing inside a storefront may exceed the
             screen width on mobile. This is the safety net for fixed-px
             widths (e.g. social cards, product cards with max-w-sm) and
             third-party embeds that ignore parent constraints. */
          .sf-layout, .sf-layout * {
            box-sizing: border-box;
          }
          .sf-layout > *,
          .sf-layout > * > *,
          .sf-layout section {
            max-width: 100vw;
          }
          /* Carousel tracks must be allowed to be wider than the viewport so
             they can scroll horizontally inside their overflow-hidden parent.
             Re-allow width on track + item, but the outer carousel container
             itself stays capped via overflow-hidden. */
          .sf-layout .storefront-social-carousel-track {
            max-width: none;
          }
          /* Round avatars must stay square — flex children get forced to
             max-width: 100% above, which can squish a fixed h/w image into
             an oval on narrow screens. Lock their aspect ratio. */
          .sf-layout img.rounded-full {
            flex-shrink: 0;
            aspect-ratio: 1 / 1;
          }
          @media (max-width: 640px) {
            .sf-layout :where(.shadow-neo, [class*="shadow-["]) {
              max-width: calc(100vw - 1rem);
            }
          }
        `}</style>
        <style>{themedCss}</style>
      </Head>
      <div
        className={`sf-layout min-h-screen w-full max-w-full overflow-x-hidden ${storefront.neoShadows ? "sf-neo" : ""}`}
        style={{
          ...cssVars,
          ...fontStyles,
          backgroundColor: "var(--sf-bg)",
          color: "var(--sf-text)",
        }}
      >
        <nav
          className="fixed top-0 right-0 left-0 z-50 h-14 border-b"
          style={{
            backgroundColor: navBg,
            borderColor: navAccent + "33",
          }}
        >
          <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 md:px-6">
            <Link href={homeHref} className="flex items-center gap-2">
              {pictureUrl && (
                <img
                  src={sanitizeUrl(pictureUrl)}
                  alt={shopName}
                  className="h-8 w-8 rounded-full object-cover"
                  fetchPriority="high"
                />
              )}
              <span
                className="font-heading text-lg font-bold"
                style={{ color: navText }}
              >
                {shopName}
              </span>
            </Link>

            {defaultNavLinks.length > 0 && (
              <div className="hidden items-center gap-1 lg:flex">
                {defaultNavLinks.map((link, idx) => {
                  const href = applyCustomDomainHref(
                    sanitizeStorefrontNavHref(link, shopSlug, homeHref),
                    shopSlug,
                    isCustomDomain
                  );
                  const isActive = currentPage
                    ? link.href === currentPage
                    : link.href === "" || link.href === "/";
                  const linkStyle = {
                    color: isActive ? navAccent : navText + "CC",
                  };
                  const linkClass =
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors";
                  if (isExternalStorefrontHref(href)) {
                    return (
                      <a
                        key={idx}
                        href={href}
                        target={href.startsWith("http") ? "_blank" : undefined}
                        rel={
                          href.startsWith("http")
                            ? "noopener noreferrer"
                            : undefined
                        }
                        className={linkClass}
                        style={linkStyle}
                      >
                        {link.label}
                      </a>
                    );
                  }
                  return (
                    <Link
                      key={idx}
                      href={href}
                      className={linkClass}
                      style={linkStyle}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/cart")}
                className="relative rounded-md p-2 transition-colors"
                style={{ color: navText }}
              >
                <ShoppingCartIcon className="h-5 w-5" />
                {cartQuantity > 0 && (
                  <span
                    className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: navAccent,
                      color: navBg,
                    }}
                  >
                    {cartQuantity}
                  </span>
                )}
              </button>

              <div className="hidden md:flex">
                {isLoggedIn && userPubkey ? (
                  <ProfileWithDropdown
                    pubkey={userPubkey}
                    baseClassname="flex-shrink-0 hover:bg-opacity-80 rounded-3xl hover:scale-105 hover:shadow-lg"
                    dropDownKeys={[
                      "shop_profile",
                      "user_profile",
                      "settings",
                      "logout",
                    ]}
                    nameClassname="lg:block text-white"
                    bg="dark"
                  />
                ) : (
                  <button
                    onClick={onOpen}
                    className="rounded-md px-4 py-1.5 text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: navAccent,
                      color: navBg,
                    }}
                  >
                    Sign In
                  </button>
                )}
              </div>

              <button
                className="flex h-8 w-8 items-center justify-center rounded md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                style={{ color: navText }}
              >
                {mobileMenuOpen ? (
                  <XMarkIcon className="h-6 w-6" />
                ) : (
                  <Bars3Icon className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div
              className="border-t md:hidden"
              style={{
                backgroundColor: navBg,
                borderColor: navAccent + "22",
              }}
            >
              {defaultNavLinks.length > 0 &&
                defaultNavLinks.map((link, idx) => {
                  const href = applyCustomDomainHref(
                    sanitizeStorefrontNavHref(link, shopSlug, homeHref),
                    shopSlug,
                    isCustomDomain
                  );
                  const mobileClass = "block px-6 py-3 text-sm font-medium";
                  const mobileStyle = { color: navText + "CC" };
                  if (isExternalStorefrontHref(href)) {
                    return (
                      <a
                        key={idx}
                        href={href}
                        target={href.startsWith("http") ? "_blank" : undefined}
                        rel={
                          href.startsWith("http")
                            ? "noopener noreferrer"
                            : undefined
                        }
                        className={mobileClass}
                        style={mobileStyle}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {link.label}
                      </a>
                    );
                  }
                  return (
                    <Link
                      key={idx}
                      href={href}
                      className={mobileClass}
                      style={mobileStyle}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              {isLoggedIn && userPubkey ? (
                <div className="px-4 py-3">
                  <ProfileWithDropdown
                    pubkey={userPubkey}
                    baseClassname="flex-shrink-0 hover:bg-opacity-80 rounded-3xl"
                    dropDownKeys={[
                      "shop_profile",
                      "user_profile",
                      "settings",
                      "logout",
                    ]}
                    nameClassname="text-white"
                    bg="dark"
                  />
                </div>
              ) : (
                <button
                  onClick={() => {
                    onOpen();
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full px-6 py-3 text-left text-sm font-medium"
                  style={{ color: navText + "CC" }}
                >
                  Sign In
                </button>
              )}
            </div>
          )}
        </nav>

        {currentPage === "shop" ? (
          <div className="pt-0">
            <StorefrontShopPage
              products={sellerProducts}
              colors={colors}
              shopName={shopName}
              shopSlug={shopSlug}
            />
          </div>
        ) : currentPage === "order-confirmation" ? (
          <div className="pt-14">
            <StorefrontOrderConfirmation
              colors={colors}
              shopName={shopName}
              shopSlug={shopSlug}
              shopPubkey={shopPubkey}
            />
          </div>
        ) : currentPage === "my-listings" ? (
          <div className="pt-14">
            <StorefrontMyListings shopPubkey={shopPubkey} colors={colors} />
          </div>
        ) : currentPage === "orders" ? (
          <div className="pt-14">
            <StorefrontOrders colors={colors} shopPubkey={shopPubkey} />
          </div>
        ) : currentPage === "wallet" ? (
          <div className="pt-14">
            {showWallet ? (
              <StorefrontWallet colors={colors} />
            ) : (
              <div className="flex min-h-screen flex-col items-center justify-center py-24 text-center">
                <h2
                  className="font-heading text-2xl font-bold"
                  style={{ color: colors.text }}
                >
                  Page Not Found
                </h2>
                <p
                  className="mt-2 text-sm"
                  style={{ color: colors.text + "99" }}
                >
                  This page doesn&apos;t exist.
                </p>
              </div>
            )}
          </div>
        ) : currentPage === "community" ? (
          <div className="pt-14">
            {showCommunity ? (
              <StorefrontCommunity
                shopPubkey={shopPubkey}
                community={sellerCommunity}
                colors={colors}
                isLoading={communityContext.isLoading}
              />
            ) : (
              <div className="flex min-h-screen flex-col items-center justify-center py-24 text-center">
                <h2
                  className="font-heading text-2xl font-bold"
                  style={{ color: colors.text }}
                >
                  Page Not Found
                </h2>
                <p
                  className="mt-2 text-sm"
                  style={{ color: colors.text + "99" }}
                >
                  This page doesn&apos;t exist.
                </p>
              </div>
            )}
          </div>
        ) : policyPageData ? (
          <div className="pt-14">
            <StorefrontPolicyPage policy={policyPageData} colors={colors} />
          </div>
        ) : (
          <>
            {!currentPage && landingStyle !== "hero" && (
              <>
                {landingStyle === "classic" && (
                  <div className="pt-14">
                    {bannerUrl && (
                      <div className="w-full">
                        <img
                          src={sanitizeUrl(bannerUrl)}
                          alt={`${shopName} Banner`}
                          className="w-full object-contain"
                          fetchPriority="high"
                        />
                      </div>
                    )}
                    <div
                      className="border-b px-6 py-8"
                      style={{ borderColor: colors.primary + "33" }}
                    >
                      <div className="mx-auto flex max-w-6xl items-center gap-6">
                        {pictureUrl && (
                          <img
                            src={sanitizeUrl(pictureUrl)}
                            alt={shopName}
                            className="h-20 w-20 rounded-full border-4 object-cover"
                            style={{ borderColor: colors.primary }}
                            fetchPriority="high"
                          />
                        )}
                        <div>
                          <h1
                            className="font-heading text-3xl font-bold"
                            style={{ color: "var(--sf-text)" }}
                          >
                            {shopName}
                          </h1>
                          {shopAbout && (
                            <FormattedText
                              text={shopAbout}
                              as="p"
                              className="font-body mt-2 max-w-2xl opacity-70"
                            />
                          )}
                          <div className="mt-2 flex items-center gap-3 text-sm opacity-60">
                            <span>{sellerProducts.length} products</span>
                            {reviewCount > 0 && (
                              <span>{reviewCount} reviews</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {landingStyle === "minimal" && (
                  <div className="px-6 pt-20 pb-4">
                    <div className="mx-auto max-w-6xl">
                      <div className="flex items-center gap-4">
                        {pictureUrl && (
                          <img
                            src={sanitizeUrl(pictureUrl)}
                            alt={shopName}
                            className="h-14 w-14 rounded-full object-cover"
                            fetchPriority="high"
                          />
                        )}
                        <div>
                          <h1 className="font-heading text-2xl font-bold">
                            {shopName}
                          </h1>
                          <p className="text-sm opacity-60">
                            {sellerProducts.length} products
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {hasSections && activeSections.length > 0 ? (
              <div
                className={
                  hasNav && (currentPage || activeSections[0]?.type === "hero")
                    ? "pt-14"
                    : ""
                }
              >
                {activeSections.map((section) => (
                  <SectionRenderer
                    key={section.id}
                    section={{
                      ...section,
                      productLayout: section.productLayout || layout,
                    }}
                    colors={colors}
                    shopName={shopName}
                    shopPicture={pictureUrl}
                    shopPubkey={shopPubkey}
                    products={sellerProducts}
                    shopSlug={shopSlug}
                  />
                ))}
              </div>
            ) : (
              <div
                className={`mx-auto max-w-6xl px-4 py-8 md:px-6 ${
                  landingStyle === "hero" ? "pt-14" : ""
                }`}
              >
                <StorefrontProductGrid
                  products={sellerProducts}
                  layout={layout}
                  colors={colors}
                  shopSlug={shopSlug}
                />
              </div>
            )}
          </>
        )}

        <StorefrontFooterComponent
          footer={defaultFooter}
          colors={colors}
          footerColors={storefront.footerColors}
          shopName={shopName}
          shopSlug={shopSlug}
        />
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
      {storefront.emailPopup?.enabled &&
        (storefront.emailPopup.discountPercentage > 0 ||
          (storefront.emailPopup.shippingDiscountType &&
            storefront.emailPopup.shippingDiscountType !== "none")) && (
          <StorefrontEmailPopupComponent
            config={storefront.emailPopup}
            colors={colors}
            shopPubkey={shopPubkey}
            shopName={shopName}
            fontHeading={fontHeading}
            fontBody={fontBody}
            neoShadows={storefront.neoShadows}
          />
        )}
    </>
  );
}

function buildGoogleFontsUrl(
  heading?: string,
  body?: string,
  customHeadingUrl?: string,
  customBodyUrl?: string
): string | null {
  const fonts = new Set<string>();
  if (heading && !customHeadingUrl && GOOGLE_FONT_OPTIONS.includes(heading))
    fonts.add(heading);
  if (body && !customBodyUrl && GOOGLE_FONT_OPTIONS.includes(body))
    fonts.add(body);
  if (customHeadingUrl || customBodyUrl) fonts.add("Poppins");
  if (fonts.size === 0) return null;
  const families = Array.from(fonts)
    .map((f) => `family=${f.replace(/ /g, "+")}:wght@400;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
