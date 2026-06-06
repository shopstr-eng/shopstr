import { useContext, useEffect, useState, useMemo } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useDisclosure } from "@heroui/react";
import {
  ShoppingCartIcon,
  Bars3Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { ShopMapContext, ProfileMapContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { ProfileWithDropdown } from "@/components/utility-components/profile/profile-dropdown";
import SignInModal from "@/components/sign-in/SignInModal";
import {
  StorefrontConfig,
  StorefrontColorScheme,
  StorefrontFooter,
} from "@/utils/types/types";
import FormattedText from "./formatted-text";
import StorefrontFooterComponent from "./storefront-footer";
import {
  StorefrontChromeProvider,
  useInsideStorefrontChrome,
} from "@/utils/storefront/storefront-chrome-context";
import {
  applyCustomDomainHref,
  useIsCustomDomain,
} from "@/utils/storefront/custom-domain-context";
import { usePublicMembershipStatus } from "@/utils/pro/use-public-membership";
import { getStorefrontCartQuantity } from "@/utils/storefront-cart";

const DEFAULT_COLORS: StorefrontColorScheme = {
  primary: "#FFD23F",
  secondary: "#1E293B",
  accent: "#3B82F6",
  background: "#FFFFFF",
  text: "#000000",
};

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

interface StorefrontThemeWrapperProps {
  sellerPubkey: string;
  // Whether to actually render the storefront chrome (nav, themed CSS,
  // footer, mobile menu). When false we return children untouched so the
  // wrapper can be mounted unconditionally from _app.tsx without changing
  // the component tree shape on hydration. The decision is driven by
  // `isCustomDomainVisit` in _app.tsx.
  renderChrome: boolean;
  children: React.ReactNode;
}

export default function StorefrontThemeWrapper(
  props: StorefrontThemeWrapperProps
) {
  const alreadyInside = useInsideStorefrontChrome();
  if (alreadyInside) {
    return <>{props.children}</>;
  }
  if (!props.renderChrome) {
    return <>{props.children}</>;
  }
  return <StorefrontThemeWrapperInner {...props} />;
}

function StorefrontThemeWrapperInner({
  sellerPubkey,
  children,
}: StorefrontThemeWrapperProps) {
  const shopMapContext = useContext(ShopMapContext);
  const profileContext = useContext(ProfileMapContext);
  const { isLoggedIn, pubkey: userPubkey } = useContext(SignerContext);
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const isCustomDomain = useIsCustomDomain();
  // Premium storefront chrome (themed nav, colors/fonts, footer) is a Pro-only
  // feature. The design is published to Nostr with no server write path to
  // block, so this is the render-layer enforcement: only Pro-entitled sellers
  // get the custom chrome. We fail closed — the hook returns a non-Pro view on
  // any /api/pro/status error, so a lapsed/non-Pro seller's design is never
  // served during an outage.
  const { isPro: sellerIsPro } = usePublicMembershipStatus(sellerPubkey);

  const [storefront, setStorefront] = useState<StorefrontConfig | null>(null);
  const [colors, setColors] = useState<StorefrontColorScheme>(DEFAULT_COLORS);
  const [cartQuantity, setCartQuantity] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!sellerPubkey || !shopMapContext.shopData.has(sellerPubkey)) return;
    // Premium design is Pro-only — never hydrate the seller's custom storefront
    // config or colors unless they're entitled. Gating here (not just at the
    // render early-return) keeps the premium fields out of the body CSS-var
    // side effect below too, so a non-Pro seller's saved colorScheme can't paint
    // the page. We fail closed: while entitlement is unresolved (isPro false)
    // we keep defaults.
    if (!sellerIsPro) {
      setStorefront(null);
      setColors(DEFAULT_COLORS);
      return;
    }
    const shopData = shopMapContext.shopData.get(sellerPubkey);
    if (shopData?.content?.storefront) {
      const sf = shopData.content.storefront;
      setStorefront(sf);
      if (sf.colorScheme) {
        setColors({ ...DEFAULT_COLORS, ...sf.colorScheme });
      }
    }
  }, [sellerPubkey, shopMapContext.shopData, sellerIsPro]);

  useEffect(() => {
    if (sellerPubkey) {
      sessionStorage.setItem("sf_seller_pubkey", sellerPubkey);
    }
    if (storefront?.shopSlug) {
      sessionStorage.setItem("sf_shop_slug", storefront.shopSlug);
    }
  }, [sellerPubkey, storefront?.shopSlug]);

  useEffect(() => {
    const sync = () => {
      setCartQuantity(getStorefrontCartQuantity(sellerPubkey));
    };
    sync();
    const interval = setInterval(sync, 1000);
    return () => clearInterval(interval);
  }, [sellerPubkey]);

  useEffect(() => {
    document.body.classList.add("sf-active");
    // While the seller's storefront config is still loading from relays,
    // paint a neutral background + text color immediately. Without this
    // the page sits as a flash of unstyled darkness for a couple of
    // seconds while Nostr profile data round-trips — which is exactly
    // the "blank screen" symptom reported on the custom domain.
    if (!storefront) {
      document.body.style.setProperty("--sf-bg", DEFAULT_COLORS.background);
      document.body.style.setProperty("--sf-text", DEFAULT_COLORS.text);
      return () => {
        document.body.classList.remove("sf-active");
        document.body.style.removeProperty("--sf-bg");
        document.body.style.removeProperty("--sf-text");
      };
    }
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
  }, [storefront, colors]);

  const hasCustomStorefront = !!storefront && sellerIsPro;
  const hasFooter = !!storefront?.footer;

  const navBg = storefront?.navColors?.background || colors.secondary;
  const navText = storefront?.navColors?.text || colors.background;
  const navAccent = storefront?.navColors?.accent || colors.primary;

  const profile = profileContext?.profileData?.get(sellerPubkey);
  const shop = shopMapContext.shopData.get(sellerPubkey);
  const shopName = shop?.content?.name || profile?.content?.name || "Stall";
  const pictureUrl =
    shop?.content?.ui?.picture || profile?.content?.picture || "";
  const shopSlug = storefront?.shopSlug || "";

  const fontHeading = storefront?.fontHeading || "";
  const fontBody = storefront?.fontBody || "";
  const customFontHeadingUrl = storefront?.customFontHeadingUrl || "";
  const customFontHeadingName = storefront?.customFontHeadingName || "";
  const customFontBodyUrl = storefront?.customFontBodyUrl || "";
  const customFontBodyName = storefront?.customFontBodyName || "";

  const googleFontsUrl = useMemo(() => {
    const fonts = new Set<string>();
    if (
      fontHeading &&
      !customFontHeadingUrl &&
      GOOGLE_FONT_OPTIONS.includes(fontHeading)
    )
      fonts.add(fontHeading);
    if (
      fontBody &&
      !customFontBodyUrl &&
      GOOGLE_FONT_OPTIONS.includes(fontBody)
    )
      fonts.add(fontBody);
    if (customFontHeadingUrl || customFontBodyUrl) fonts.add("Poppins");
    if (fonts.size === 0) return null;
    const families = Array.from(fonts)
      .map((f) => `family=${f.replace(/ /g, "+")}:wght@400;600;700`)
      .join("&");
    return `https://fonts.googleapis.com/css2?${families}&display=swap`;
  }, [fontHeading, fontBody, customFontHeadingUrl, customFontBodyUrl]);

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

  const defaultFooter: StorefrontFooter = hasFooter
    ? storefront!.footer!
    : { showPoweredBy: true };

  if (!hasCustomStorefront) {
    return <>{children}</>;
  }

  // NOTE: `isCustomDomain` is already in scope from the top of this component
  // (line 87). Calling useIsCustomDomain() again here was both a duplicate
  // declaration and a Rules-of-Hooks violation (the hook would be called
  // conditionally, since the early-return above could skip past it).
  const homeHref = applyCustomDomainHref(
    shopSlug ? `/stall/${shopSlug}` : "/marketplace",
    shopSlug,
    isCustomDomain
  );
  const ordersHref = applyCustomDomainHref(
    shopSlug ? `/stall/${shopSlug}/orders` : "/orders",
    shopSlug,
    isCustomDomain
  );

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

  const themedCss = `
    .storefront-themed .font-heading { font-family: var(--font-heading, inherit); }
    .storefront-themed .font-body { font-family: var(--font-body, inherit); }
    .storefront-themed, .storefront-themed p, .storefront-themed span, .storefront-themed li, .storefront-themed a, .storefront-themed label, .storefront-themed div, .storefront-themed input, .storefront-themed textarea, .storefront-themed select, .storefront-themed button {
      font-family: var(--font-body, inherit);
    }
    .storefront-themed h1, .storefront-themed h2, .storefront-themed h3, .storefront-themed h4, .storefront-themed h5, .storefront-themed h6,
    .storefront-themed .font-heading, .storefront-themed button.font-heading {
      font-family: var(--font-heading, var(--font-body, inherit));
    }
    .storefront-themed .bg-primary-yellow { background-color: var(--sf-primary) !important; }
    .storefront-themed .bg-primary-blue { background-color: var(--sf-secondary) !important; }
    .storefront-themed .text-primary-blue { color: var(--sf-secondary) !important; }
    .storefront-themed .hover\\:text-primary-blue:hover { color: var(--sf-accent) !important; }
    .storefront-themed .border-primary-yellow { border-color: var(--sf-primary) !important; }
    .storefront-themed .border-black { border-color: var(--sf-secondary) !important; }
    .storefront-themed .shadow-neo {
      box-shadow: 4px 4px 0 var(--sf-secondary) !important;
    }
    .storefront-themed .bg-white { background-color: var(--sf-bg) !important; }
    .storefront-themed .text-black { color: var(--sf-text) !important; }
    .storefront-themed .text-gray-500 { color: color-mix(in srgb, var(--sf-text) 50%, transparent) !important; }
    .storefront-themed .text-gray-600 { color: color-mix(in srgb, var(--sf-text) 60%, transparent) !important; }
    .storefront-themed .bg-blue-100 { background-color: color-mix(in srgb, var(--sf-accent) 15%, var(--sf-bg)) !important; }
    .storefront-themed .hover\\:bg-blue-200:hover { background-color: color-mix(in srgb, var(--sf-accent) 25%, var(--sf-bg)) !important; }

    ${
      storefront?.neoShadows
        ? `
    .storefront-themed.sf-neo .rounded-lg.border-2,
    .storefront-themed.sf-neo .rounded-xl.border-2,
    .storefront-themed.sf-neo .rounded-2xl.border-2,
    .storefront-themed.sf-neo .rounded.border-2,
    .storefront-themed.sf-neo .rounded-lg.border,
    .storefront-themed.sf-neo .rounded-xl.border,
    .storefront-themed.sf-neo .rounded-2xl.border,
    .storefront-themed.sf-neo .rounded.border,
    .storefront-themed.sf-neo img.border,
    .storefront-themed.sf-neo img.border-2 {
      box-shadow: 4px 4px 0 var(--sf-secondary) !important;
    }
    .storefront-themed.sf-neo .rounded-lg.border,
    .storefront-themed.sf-neo .rounded-xl.border,
    .storefront-themed.sf-neo .rounded-2xl.border,
    .storefront-themed.sf-neo .rounded.border {
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
      storefront?.neoShadows
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

  return (
    <StorefrontChromeProvider>
      <Head>
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
        <style>{themedCss}</style>
      </Head>
      <div
        className={`storefront-themed min-h-screen ${storefront?.neoShadows ? "sf-neo" : ""}`}
        style={{
          ...cssVars,
          ...fontStyles,
          backgroundColor: "var(--sf-bg)",
          color: "var(--sf-text)",
        }}
      >
        <nav
          className="fixed top-0 right-0 left-0 z-50 border-b"
          style={{
            backgroundColor: navBg,
            borderColor: navAccent + "33",
          }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 md:px-6">
            <a href={homeHref} className="flex items-center gap-2">
              {pictureUrl && (
                <img
                  src={pictureUrl}
                  alt={shopName}
                  className="h-8 w-8 rounded-full object-cover"
                  fetchPriority="high"
                />
              )}
              <FormattedText
                as="span"
                className="font-heading text-lg font-bold"
                style={{ color: navText }}
                text={shopName}
              />
            </a>

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
              {shopSlug && (
                <>
                  <a
                    href={homeHref}
                    className="block px-6 py-3 text-sm font-medium"
                    style={{ color: navText + "CC" }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Back to Stall
                  </a>
                  <a
                    href={ordersHref}
                    className="block px-6 py-3 text-sm font-medium"
                    style={{ color: navText + "CC" }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Orders
                  </a>
                </>
              )}
            </div>
          )}
        </nav>

        <div>{children}</div>

        <StorefrontFooterComponent
          footer={defaultFooter}
          colors={colors}
          footerColors={storefront?.footerColors}
          shopName={shopName}
          shopSlug={shopSlug}
        />
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </StorefrontChromeProvider>
  );
}
