import { useContext, useEffect, useMemo, useState } from "react";
import {
  ProductContext,
  ProfileMapContext,
  ShopMapContext,
} from "@/utils/context/context";
import {
  StorefrontColorScheme,
  StorefrontConfig,
  StorefrontSection,
  NostrEvent,
} from "@/utils/types/types";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import SectionRenderer from "./section-renderer";

const DEFAULT_COLORS: StorefrontColorScheme = {
  primary: "#FFD23F",
  secondary: "#1E293B",
  accent: "#3B82F6",
  background: "#FFFFFF",
  text: "#000000",
};

interface ProductPageRendererProps {
  product: ProductData;
  sellerPubkey: string;
}

export default function ProductPageRenderer({
  product,
  sellerPubkey,
}: ProductPageRendererProps) {
  const shopMapContext = useContext(ShopMapContext);
  const profileMapContext = useContext(ProfileMapContext);
  const productContext = useContext(ProductContext);

  const [storefront, setStorefront] = useState<StorefrontConfig | null>(null);

  useEffect(() => {
    if (!sellerPubkey) return;
    const shopData = shopMapContext.shopData.get(sellerPubkey);
    const sf = shopData?.content?.storefront;
    if (sf) setStorefront(sf);
  }, [sellerPubkey, shopMapContext.shopData]);

  const sections: StorefrontSection[] = useMemo(() => {
    const overrideSections = product.pageConfig?.sections;
    if (overrideSections && overrideSections.length > 0) {
      return overrideSections;
    }
    return storefront?.productPageDefaults || [];
  }, [product.pageConfig, storefront]);

  const colors: StorefrontColorScheme = useMemo(() => {
    const base = { ...DEFAULT_COLORS, ...(storefront?.colorScheme || {}) };
    const overrides = product.pageConfig?.themeOverrides || {};
    return { ...base, ...overrides };
  }, [storefront, product.pageConfig]);

  const sellerProducts: ProductData[] = useMemo(() => {
    const events = productContext?.productEvents || [];
    return events
      .filter((e: NostrEvent) => e.kind !== 1 && e.pubkey === sellerPubkey)
      .map((e: NostrEvent) => parseTags(e))
      .filter((p): p is ProductData => !!p);
  }, [productContext?.productEvents, sellerPubkey]);

  if (sections.length === 0) return null;

  const profile = profileMapContext?.profileData?.get(sellerPubkey);
  const shop = shopMapContext.shopData.get(sellerPubkey);
  const shopName = shop?.content?.name || profile?.content?.name || "Stall";
  const shopPicture =
    shop?.content?.ui?.picture || profile?.content?.picture || "";

  const hasOverrides =
    !!product.pageConfig?.themeOverrides &&
    Object.keys(product.pageConfig.themeOverrides).length > 0;

  const overrideStyle = hasOverrides
    ? ({
        "--sf-primary": colors.primary,
        "--sf-secondary": colors.secondary,
        "--sf-accent": colors.accent,
        "--sf-bg": colors.background,
        "--sf-text": colors.text,
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      style={overrideStyle}
      className="product-page-sections"
      data-product-d={product.d}
    >
      {sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          colors={colors}
          shopName={shopName}
          shopPicture={shopPicture}
          shopPubkey={sellerPubkey}
          products={sellerProducts}
          currentProduct={product}
        />
      ))}
    </div>
  );
}
