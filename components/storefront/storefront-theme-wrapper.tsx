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
import StorefrontFooterComponent from "./storefront-footer";
import { getNavTextColor } from "@/utils/storefront-colors";

const DEFAULT_COLORS: StorefrontColorScheme = {
  primary: "#a438ba",
  secondary: "#f5f5f5",
  accent: "#a655f7",
  background: "#e8e8e8",
  text: "#212121",
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
  children: React.ReactNode;
}

export default function StorefrontThemeWrapper({
  sellerPubkey,
  children,
}: StorefrontThemeWrapperProps) {
  const shopMapContext = useContext(ShopMapContext);
  const profileContext = useContext(ProfileMapContext);
  const { isLoggedIn, pubkey: userPubkey } = useContext(SignerContext);
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [storefront, setStorefront] = useState<StorefrontConfig | null>(null);
  const [colors, setColors] = useState<StorefrontColorScheme>(DEFAULT_COLORS);
  const [cartQuantity, setCartQuantity] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!sellerPubkey || !shopMapContext.shopData.has(sellerPubkey)) return;
    const shopData = shopMapContext.shopData.get(sellerPubkey);
    if (shopData?.content?.storefront) {
      const sf = shopData.content.storefront;
      setStorefront(sf);
      if (sf.colorScheme) {
        setColors({ ...DEFAULT_COLORS, ...sf.colorScheme });
      }
    }
  }, [sellerPubkey, shopMapContext.shopData]);

  useEffect(() => {
    if (sellerPubkey) {
      sessionStorage.setItem("sf_seller_pubkey", sellerPubkey);
      localStorage.setItem("sf_seller_pubkey", sellerPubkey);
    }
    if (storefront?.shopSlug) {
      sessionStorage.setItem("sf_shop_slug", storefront.shopSlug);
      localStorage.setItem("sf_shop_slug", storefront.shopSlug);
    }
  }, [sellerPubkey, storefront?.shopSlug]);

  useEffect(() => {
    const sync = () => {
      const cart = localStorage.getItem("cart");
      if (!cart) {
        setCartQuantity(0);
        return;
      }
      const items = JSON.parse(cart) as { pubkey?: string }[];
      setCartQuantity(
        sellerPubkey
          ? items.filter((p) => p.pubkey === sellerPubkey).length
          : items.length
      );
    };
    sync();
    const interval = setInterval(sync, 1000);
    return () => clearInterval(interval);
  }, [sellerPubkey]);

  useEffect(() => {
    const vars: Record<string, string> = {
      "--sf-primary": colors.primary,
      "--sf-secondary": colors.secondary,
      "--sf-accent": colors.accent,
      "--sf-bg": colors.background,
      "--sf-text": colors.text,
    };
    if (storefront) {
      document.body.classList.add("sf-active");
      for (const [k, v] of Object.entries(vars)) {
        document.body.style.setProperty(k, v);
      }
    }
    return () => {
      document.body.classList.remove("sf-active");
      for (const k of Object.keys(vars)) {
        document.body.style.removeProperty(k);
      }
    };
  }, [storefront, colors]);

  const hasCustomStorefront = !!storefront;
  const hasFooter = !!storefront?.footer;

  const profile = profileContext?.profileData?.get(sellerPubkey);
  const shop = shopMapContext.shopData.get(sellerPubkey);
  const shopName = shop?.content?.name || profile?.content?.name || "Shop";
  const pictureUrl =
    shop?.content?.ui?.picture || profile?.content?.picture || "";
  const shopSlug = storefront?.shopSlug || "";

  const fontHeading = storefront?.fontHeading || "";
  const fontBody = storefront?.fontBody || "";

  const googleFontsUrl = useMemo(() => {
    const fonts = new Set<string>();
    if (fontHeading && GOOGLE_FONT_OPTIONS.includes(fontHeading))
      fonts.add(fontHeading);
    if (fontBody && GOOGLE_FONT_OPTIONS.includes(fontBody)) fonts.add(fontBody);
    if (fonts.size === 0) return null;
    const families = Array.from(fonts)
      .map((f) => `family=${f.replace(/ /g, "+")}:wght@400;600;700`)
      .join("&");
    return `https://fonts.googleapis.com/css2?${families}&display=swap`;
  }, [fontHeading, fontBody]);

  const navTextColor = getNavTextColor(colors.secondary);

  const defaultFooter: StorefrontFooter = hasFooter
    ? storefront!.footer!
    : { showPoweredBy: true };

  if (!hasCustomStorefront) {
    return <>{children}</>;
  }

  const homeHref = shopSlug ? `/shop/${shopSlug}` : "/marketplace";

  const cssVars = {
    "--sf-primary": colors.primary,
    "--sf-secondary": colors.secondary,
    "--sf-accent": colors.accent,
    "--sf-bg": colors.background,
    "--sf-text": colors.text,
    "--sf-nav-text": navTextColor,
  } as React.CSSProperties;

  const fontStyles = {
    ...(fontHeading
      ? { "--font-heading": `'${fontHeading}', sans-serif` }
      : {}),
    ...(fontBody ? { "--font-body": `'${fontBody}', sans-serif` } : {}),
  } as React.CSSProperties;

  const themedCss = `
    .storefront-themed .font-heading { font-family: var(--font-heading, inherit); }
    .storefront-themed .font-body { font-family: var(--font-body, inherit); }
    .storefront-themed .bg-primary-yellow { background-color: var(--sf-primary) !important; }
    .storefront-themed .bg-primary-blue { background-color: var(--sf-secondary) !important; }
    .storefront-themed .text-primary-blue { color: var(--sf-secondary) !important; }
    .storefront-themed .hover\\:text-primary-blue:hover { color: var(--sf-accent) !important; }
    .storefront-themed .border-primary-yellow { border-color: var(--sf-primary) !important; }
    .storefront-themed .border-black { border-color: var(--sf-secondary) !important; }
    .storefront-themed .bg-white { background-color: var(--sf-bg) !important; }
    .storefront-themed .text-black { color: var(--sf-text) !important; }
    .storefront-themed .text-gray-500 { color: color-mix(in srgb, var(--sf-text) 50%, transparent) !important; }
    .storefront-themed .text-gray-600 { color: color-mix(in srgb, var(--sf-text) 60%, transparent) !important; }
    .storefront-themed .bg-blue-100 { background-color: color-mix(in srgb, var(--sf-accent) 15%, var(--sf-bg)) !important; }
    .storefront-themed .hover\\:bg-blue-200:hover { background-color: color-mix(in srgb, var(--sf-accent) 25%, var(--sf-bg)) !important; }

    body.sf-active [data-overlay-container] .border-black { border-color: var(--sf-secondary) !important; }
    body.sf-active [data-overlay-container] .bg-white { background-color: var(--sf-bg) !important; }
    body.sf-active [data-overlay-container] .text-black { color: var(--sf-text) !important; }
    body.sf-active [data-overlay-container] .bg-primary-yellow { background-color: var(--sf-primary) !important; }
    body.sf-active [data-overlay-container] .bg-primary-blue { background-color: var(--sf-secondary) !important; }
    body.sf-active [data-overlay-container] .border-primary-yellow { border-color: var(--sf-primary) !important; }
    body.sf-active [data-overlay-container] .font-heading { font-family: var(--font-heading, inherit); }
    body.sf-active [data-overlay-container] .font-body { font-family: var(--font-body, inherit); }
    body.sf-active nav .text-light-text { color: var(--sf-nav-text) !important; }
  `;

  return (
    <>
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
        <style>{themedCss}</style>
      </Head>
      <div
        className="storefront-themed min-h-screen"
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
            backgroundColor: colors.secondary,
            borderColor: colors.primary + "33",
          }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 md:px-6">
            <a href={homeHref} className="flex items-center gap-2">
              {pictureUrl && (
                <img
                  src={pictureUrl}
                  alt={shopName}
                  className="h-8 w-8 rounded-full object-cover"
                />
              )}
              <span
                className="font-heading text-lg font-bold"
                style={{ color: navTextColor }}
              >
                {shopName}
              </span>
            </a>

            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/cart")}
                className="relative rounded-md p-2 transition-colors"
                style={{ color: navTextColor }}
              >
                <ShoppingCartIcon className="h-5 w-5" />
                {cartQuantity > 0 && (
                  <span
                    className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: colors.primary,
                      color: colors.secondary,
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
                    nameClassname="lg:block"
                  />
                ) : (
                  <button
                    onClick={onOpen}
                    className="rounded-md px-4 py-1.5 text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: colors.primary,
                      color: colors.secondary,
                    }}
                  >
                    Sign In
                  </button>
                )}
              </div>

              <button
                className="flex h-8 w-8 items-center justify-center rounded md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                style={{ color: navTextColor }}
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
                backgroundColor: colors.secondary,
                borderColor: colors.primary + "22",
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
                    nameClassname=""
                  />
                </div>
              ) : (
                <button
                  onClick={() => {
                    onOpen();
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full px-6 py-3 text-left text-sm font-medium"
                  style={{ color: navTextColor + "CC" }}
                >
                  Sign In
                </button>
              )}
              {shopSlug && (
                <>
                  <a
                    href={homeHref}
                    className="block px-6 py-3 text-sm font-medium"
                    style={{ color: navTextColor + "CC" }}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Back to Shop
                  </a>
                  <a
                    href={`/shop/${shopSlug}/orders`}
                    className="block px-6 py-3 text-sm font-medium"
                    style={{ color: navTextColor + "CC" }}
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
          shopName={shopName}
          shopSlug={shopSlug}
        />
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </>
  );
}
