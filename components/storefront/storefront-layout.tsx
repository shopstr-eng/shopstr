import { useContext, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import { ShopMapContext, ProductContext, ProfileMapContext, ReviewsContext } from "@/utils/context/context";
import { ShopProfile, StorefrontConfig, StorefrontColorScheme } from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";
import DisplayProducts from "@/components/display-products";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import parseTags from "@/utils/parsers/product-parser-functions";
import { ProfileWithDropdown } from "@/components/utility-components/profile/profile-dropdown";
import { Button, Chip } from "@nextui-org/react";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import Link from "next/link";
import StorefrontHero from "./storefront-hero";
import StorefrontProductGrid from "./storefront-product-grid";

const DEFAULT_COLORS: StorefrontColorScheme = {
  primary: "#FFD23F",
  secondary: "#1E293B",
  accent: "#3B82F6",
  background: "#FFFFFF",
  text: "#000000",
};

interface StorefrontLayoutProps {
  shopPubkey: string;
}

export default function StorefrontLayout({ shopPubkey }: StorefrontLayoutProps) {
  const shopMapContext = useContext(ShopMapContext);
  const productContext = useContext(ProductContext);
  const profileContext = useContext(ProfileMapContext);
  const reviewsContext = useContext(ReviewsContext);
  const router = useRouter();

  const [shop, setShop] = useState<ShopProfile | undefined>();
  const [storefront, setStorefront] = useState<StorefrontConfig>({});
  const [colors, setColors] = useState<StorefrontColorScheme>(DEFAULT_COLORS);

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
  const pictureUrl = shop?.content?.ui?.picture || profile?.content?.picture || "";
  const layout = storefront.productLayout || "grid";
  const landingStyle = storefront.landingPageStyle || "hero";

  const cssVars = {
    "--sf-primary": colors.primary,
    "--sf-secondary": colors.secondary,
    "--sf-accent": colors.accent,
    "--sf-bg": colors.background,
    "--sf-text": colors.text,
  } as React.CSSProperties;

  const merchantReviewData = reviewsContext.merchantReviewsData.get(shopPubkey);
  const reviewCount = merchantReviewData
    ? Array.from(merchantReviewData.values()).reduce((sum, arr) => sum + arr.length, 0)
    : 0;

  return (
    <div className="min-h-screen" style={{ ...cssVars, backgroundColor: "var(--sf-bg)", color: "var(--sf-text)" }}>
      {landingStyle === "hero" && (
        <StorefrontHero
          shopName={shopName}
          shopAbout={shopAbout}
          bannerUrl={bannerUrl}
          pictureUrl={pictureUrl}
          colors={colors}
          productCount={sellerProducts.length}
          reviewCount={reviewCount}
        />
      )}

      {landingStyle === "classic" && (
        <>
          {bannerUrl && (
            <div className="w-full">
              <img
                src={sanitizeUrl(bannerUrl)}
                alt={`${shopName} Banner`}
                className="h-[200px] w-full object-cover md:h-[280px]"
              />
            </div>
          )}
          <div className="border-b px-6 py-8" style={{ borderColor: colors.primary + "33" }}>
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
                <h1 className="text-3xl font-bold" style={{ color: "var(--sf-text)" }}>{shopName}</h1>
                {shopAbout && <p className="mt-2 max-w-2xl opacity-70">{shopAbout}</p>}
                <div className="mt-2 flex items-center gap-3 text-sm opacity-60">
                  <span>{sellerProducts.length} products</span>
                  {reviewCount > 0 && <span>{reviewCount} reviews</span>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {landingStyle === "minimal" && (
        <div className="px-6 pb-4 pt-24">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center gap-4">
              {pictureUrl && (
                <img
                  src={sanitizeUrl(pictureUrl)}
                  alt={shopName}
                  className="h-14 w-14 rounded-full object-cover"
                />
              )}
              <div>
                <h1 className="text-2xl font-bold">{shopName}</h1>
                <p className="text-sm opacity-60">{sellerProducts.length} products</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <StorefrontProductGrid
          products={sellerProducts}
          layout={layout}
          colors={colors}
        />
      </div>

      <footer className="border-t px-6 py-8 text-center text-sm opacity-50" style={{ borderColor: colors.text + "1A" }}>
        <p>{shopName} &middot; Powered by <Link href="/" className="underline" style={{ color: "var(--sf-accent)" }}>Milk Market</Link></p>
      </footer>
    </div>
  );
}
