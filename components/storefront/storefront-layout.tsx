import { useContext, useEffect, useState, useMemo } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useDisclosure } from "@nextui-org/react";
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
  StorefrontPolicies,
} from "@/utils/types/types";
import { POLICY_SLUGS, getDefaultPolicies } from "@/utils/storefront-policies";
import { nip19 } from "nostr-tools";
import { sanitizeUrl } from "@braintree/sanitize-url";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import parseTags from "@/utils/parsers/product-parser-functions";
import Link from "next/link";
import StorefrontHero from "./storefront-hero";
import StorefrontProductGrid from "./storefront-product-grid";
import SectionRenderer from "./section-renderer";
import StorefrontFooterComponent from "./storefront-footer";
import StorefrontCommunity from "./storefront-community";
import StorefrontOrders from "./storefront-orders";
import StorefrontWallet from "./storefront-wallet";
import StorefrontMyListings from "./storefront-my-listings";
import StorefrontOrderConfirmation from "./storefront-order-confirmation";
import StorefrontPolicyPage from "./storefront-policy-page";

const DEFAULT_COLORS: StorefrontColorScheme = {
  primary: "#a438ba",
  secondary: "#f5f5f5",
  accent: "#a655f7",
  background: "#e8e8e8",
  text: "#212121",
};

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

  const [shop, setShop] = useState<ShopProfile | undefined>();
  const [storefront, setStorefront] = useState<StorefrontConfig>({});
  const [colors, setColors] = useState<StorefrontColorScheme>(DEFAULT_COLORS);
  const [cartQuantity, setCartQuantity] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (shopPubkey && shopMapContext.shopData.has(shopPubkey)) {
      const shopData = shopMapContext.shopData.get(shopPubkey);
      if (shopData) {
        setShop(shopData);
        if (shopData.content.storefront) {
          setStorefront(shopData.content.storefront);
          if (shopData.content.storefront.colorScheme) {
            setColors({
              ...DEFAULT_COLORS,
              ...shopData.content.storefront.colorScheme,
            });
          }
        }
      }
    }
  }, [shopPubkey, shopMapContext.shopData]);

  useEffect(() => {
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
  }, [colors]);

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
      const cart = localStorage.getItem("cart");
      if (!cart) {
        setCartQuantity(0);
        return;
      }
      const items = JSON.parse(cart) as { pubkey?: string }[];
      setCartQuantity(
        shopPubkey
          ? items.filter((p) => p.pubkey === shopPubkey).length
          : items.length
      );
    };
    sync();
    const interval = setInterval(sync, 1000);
    return () => clearInterval(interval);
  }, []);

  const sellerProducts = useMemo(() => {
    if (!shopPubkey || !productContext.productEvents.length) return [];
    return productContext.productEvents
      .filter((event: any) => event.pubkey === shopPubkey)
      .map((event: any) => parseTags(event))
      .filter((p: ProductData | undefined) => p !== undefined) as ProductData[];
  }, [shopPubkey, productContext.productEvents]);

  const profile = profileContext.profileData.get(shopPubkey);
  const shopName = shop?.content?.name || profile?.content?.name || "Shop";
  const shopAbout = shop?.content?.about || profile?.content?.about || "";
  const bannerUrl = shop?.content?.ui?.banner || "";
  const pictureUrl =
    shop?.content?.ui?.picture || profile?.content?.picture || "";

  const fontHeading = storefront.fontHeading || "";
  const fontBody = storefront.fontBody || "";
  const googleFontsUrl = buildGoogleFontsUrl(fontHeading, fontBody);

  const hasSections = storefront.sections && storefront.sections.length > 0;
  const hasNav = storefront.navLinks && storefront.navLinks.length > 0;
  const hasFooter = !!storefront.footer;

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
  const reviewCount = merchantReviewData ? merchantReviewData.length : 0;

  const showCommunity = !!storefront.showCommunityPage;
  const showWallet = !!storefront.showWalletPage;
  const isShopOwner = isLoggedIn && userPubkey === shopPubkey;

  const sellerNpub = useMemo(() => {
    try {
      return nip19.npubEncode(shopPubkey);
    } catch {
      return "";
    }
  }, [shopPubkey]);

  const contactNavLink: StorefrontNavLink | null = storefront.contactEmail
    ? { label: "Contact", href: `mailto:${storefront.contactEmail}` }
    : sellerNpub
      ? {
          label: "Contact",
          href: `orders?pk=${sellerNpub}&isInquiry=true`,
          isPage: true,
        }
      : null;

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
      : [{ label: "Shop", href: "" }];
    if (!isShopOwner) {
      links = links.filter(
        (l) => l.href !== "my-listings" && l.href !== "/my-listings"
      );
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
    if (contactNavLink) {
      const alreadyHasContact = links.some(
        (l) => l.label?.toLowerCase() === "contact"
      );
      if (!alreadyHasContact) {
        links.push(contactNavLink);
      }
    }
    return links;
  }, [
    hasNav,
    storefront.navLinks,
    showCommunity,
    showWallet,
    isShopOwner,
    contactNavLink,
  ]);

  const cssVars = {
    "--sf-primary": colors.primary,
    "--sf-secondary": colors.secondary,
    "--sf-accent": colors.accent,
    "--sf-bg": colors.background,
    "--sf-text": colors.text,
  } as React.CSSProperties;

  const fontStyles = {
    ...(fontHeading
      ? { "--font-heading": `'${fontHeading}', sans-serif` }
      : {}),
    ...(fontBody ? { "--font-body": `'${fontBody}', sans-serif` } : {}),
  } as React.CSSProperties;

  const defaultFooter: StorefrontFooter = hasFooter
    ? storefront.footer!
    : { showPoweredBy: true };

  const homeHref = shopSlug ? `/shop/${shopSlug}` : "/marketplace";

  const resolveNavHref = (link: StorefrontNavLink) => {
    if (link.isPage) return `/shop/${shopSlug}/${link.href}`;
    if (
      link.href.startsWith("/") ||
      link.href.startsWith("http") ||
      link.href.startsWith("mailto:")
    )
      return link.href;
    return `/shop/${shopSlug}/${link.href}`;
  };

  const isExternalNavHref = (href: string) =>
    href.startsWith("http") || href.startsWith("mailto:");

  const themedCss = `
    body.sf-active [data-overlay-container] .border-black { border-color: var(--sf-secondary) !important; }
    body.sf-active [data-overlay-container] .bg-white { background-color: var(--sf-bg) !important; }
    body.sf-active [data-overlay-container] .text-black { color: var(--sf-text) !important; }
    body.sf-active [data-overlay-container] .bg-primary-yellow { background-color: var(--sf-primary) !important; }
    body.sf-active [data-overlay-container] .bg-primary-blue { background-color: var(--sf-secondary) !important; }
    body.sf-active [data-overlay-container] .border-primary-yellow { border-color: var(--sf-primary) !important; }
    body.sf-active [data-overlay-container] .font-heading { font-family: var(--font-heading, inherit); }
    body.sf-active [data-overlay-container] .font-body { font-family: var(--font-body, inherit); }
  `;

  return (
    <>
      <Head>
        <title>{shopName}</title>
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
        <style>{`
          .font-heading { font-family: var(--font-heading, inherit); }
          .font-body { font-family: var(--font-body, inherit); }
        `}</style>
        <style>{themedCss}</style>
      </Head>
      <div
        className="min-h-screen"
        style={{
          ...cssVars,
          ...fontStyles,
          backgroundColor: "var(--sf-bg)",
          color: "var(--sf-text)",
        }}
      >
        <nav
          className="fixed left-0 right-0 top-0 z-50 border-b"
          style={{
            backgroundColor: colors.secondary,
            borderColor: colors.primary + "33",
          }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 md:px-6">
            <Link href={homeHref} className="flex items-center gap-2">
              {pictureUrl && (
                <img
                  src={sanitizeUrl(pictureUrl)}
                  alt={shopName}
                  className="h-8 w-8 rounded-full object-cover"
                />
              )}
              <span
                className="font-heading text-lg font-bold"
                style={{ color: colors.background }}
              >
                {shopName}
              </span>
            </Link>

            {defaultNavLinks.length > 0 && (
              <div className="hidden items-center gap-1 lg:flex">
                {defaultNavLinks.map((link, idx) => {
                  const href = resolveNavHref(link);
                  const isActive = currentPage
                    ? link.href === currentPage
                    : link.href === "" || link.href === "/";
                  const linkStyle = {
                    color: isActive ? colors.primary : colors.background + "CC",
                  };
                  const linkClass =
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors";
                  if (isExternalNavHref(href)) {
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
                style={{ color: colors.background }}
              >
                <ShoppingCartIcon className="h-5 w-5" />
                {cartQuantity > 0 && (
                  <span
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
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
                    nameClassname="lg:block text-white"
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
                style={{ color: colors.background }}
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
              {defaultNavLinks.length > 0 &&
                defaultNavLinks.map((link, idx) => {
                  const href = resolveNavHref(link);
                  const mobileClass = "block px-6 py-3 text-sm font-medium";
                  const mobileStyle = { color: colors.background + "CC" };
                  if (isExternalNavHref(href)) {
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
                  />
                </div>
              ) : (
                <button
                  onClick={() => {
                    onOpen();
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full px-6 py-3 text-left text-sm font-medium"
                  style={{ color: colors.background + "CC" }}
                >
                  Sign In
                </button>
              )}
            </div>
          )}
        </nav>

        {currentPage === "order-confirmation" ? (
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
            <StorefrontOrders colors={colors} />
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
        ) : hasSections && activeSections.length > 0 ? (
          <div className="pt-14">
            {activeSections.map((section) => (
              <SectionRenderer
                key={section.id}
                section={section}
                colors={colors}
                shopName={shopName}
                shopPicture={pictureUrl}
                shopPubkey={shopPubkey}
                products={sellerProducts}
              />
            ))}
          </div>
        ) : (
          <>
            {landingStyle === "hero" && (
              <div className="pt-14">
                <StorefrontHero
                  shopName={shopName}
                  shopAbout={shopAbout}
                  bannerUrl={bannerUrl}
                  pictureUrl={pictureUrl}
                  colors={colors}
                  productCount={sellerProducts.length}
                  reviewCount={reviewCount}
                />
              </div>
            )}

            {landingStyle === "classic" && (
              <div className="pt-14">
                {bannerUrl && (
                  <div className="w-full">
                    <img
                      src={sanitizeUrl(bannerUrl)}
                      alt={`${shopName} Banner`}
                      className="h-[200px] w-full object-cover md:h-[280px]"
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
                        <p className="font-body mt-2 max-w-2xl opacity-70">
                          {shopAbout}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-sm opacity-60">
                        <span>{sellerProducts.length} products</span>
                        {reviewCount > 0 && <span>{reviewCount} reviews</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {landingStyle === "minimal" && (
              <div className="px-6 pb-4 pt-20">
                <div className="mx-auto max-w-6xl">
                  <div className="flex items-center gap-4">
                    {pictureUrl && (
                      <img
                        src={sanitizeUrl(pictureUrl)}
                        alt={shopName}
                        className="h-12 w-12 rounded-full object-cover"
                        style={{ borderColor: colors.primary }}
                      />
                    )}
                    <h1
                      className="font-heading text-2xl font-bold"
                      style={{ color: "var(--sf-text)" }}
                    >
                      {shopName}
                    </h1>
                  </div>
                </div>
              </div>
            )}

            <div
              className={`mx-auto max-w-6xl px-4 py-8 md:px-6 ${
                landingStyle !== "minimal" ? "" : "pt-4"
              }`}
            >
              <StorefrontProductGrid
                products={sellerProducts}
                layout={layout}
                colors={colors}
              />
            </div>
          </>
        )}

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

function buildGoogleFontsUrl(
  fontHeading: string,
  fontBody: string
): string | null {
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
  const fonts = new Set<string>();
  if (fontHeading && GOOGLE_FONT_OPTIONS.includes(fontHeading))
    fonts.add(fontHeading);
  if (fontBody && GOOGLE_FONT_OPTIONS.includes(fontBody)) fonts.add(fontBody);
  if (fonts.size === 0) return null;
  const families = Array.from(fonts)
    .map((f) => `family=${f.replace(/ /g, "+")}:wght@400;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
