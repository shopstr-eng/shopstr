import { useContext } from "react";
import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import StorefrontProductGrid from "../storefront-product-grid";
import { ShopMapContext } from "@/utils/context/context";

interface Props {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
  products: ProductData[];
  currentProduct: ProductData;
  shopPubkey?: string;
}

export default function SectionRelatedProducts({
  section,
  colors,
  products,
  currentProduct,
  shopPubkey,
}: Props) {
  const shopMapContext = useContext(ShopMapContext);
  const targetPubkey = shopPubkey || currentProduct.pubkey;
  const shopSlug = targetPubkey
    ? shopMapContext.shopData.get(targetPubkey)?.content?.storefront?.shopSlug
    : undefined;
  const browseHref = shopSlug ? `/stall/${shopSlug}` : "/marketplace";
  const limit = section.productLimit ?? 6;
  const layout = section.productLayout || "grid";

  let candidates = products;
  if (section.excludeCurrentProduct !== false) {
    candidates = candidates.filter(
      (p) => p.id !== currentProduct.id && p.d !== currentProduct.d
    );
  }

  const explicitIds = section.productIds || [];
  let ordered: ProductData[];
  if (explicitIds.length > 0) {
    const idMap = new Map(candidates.map((p) => [p.id, p]));
    ordered = explicitIds
      .map((id) => idMap.get(id))
      .filter((p): p is ProductData => !!p);
  } else {
    const currentCats = new Set(currentProduct.categories || []);
    const sameCategory = candidates.filter((p) =>
      (p.categories || []).some((c) => currentCats.has(c))
    );
    const others = candidates.filter((p) => !sameCategory.includes(p));
    ordered = [...sameCategory, ...others];
  }

  const displayProducts = ordered.slice(0, limit);
  const heading = section.heading || "You may also like";

  if (displayProducts.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
        <h2
          className="font-heading mb-4 text-2xl font-bold md:text-3xl"
          style={{ color: colors.text }}
        >
          {heading}
        </h2>
        <div
          className="flex flex-col items-center gap-4 rounded-xl border-2 px-6 py-10 text-center"
          style={{
            borderColor: colors.primary + "33",
            backgroundColor: colors.secondary + "06",
          }}
        >
          <p
            className="font-body text-base opacity-80"
            style={{ color: colors.text }}
          >
            More items coming soon. In the meantime, take a look at the rest of
            the shop.
          </p>
          <a
            href={browseHref}
            className="inline-block rounded-lg px-6 py-2.5 text-base font-bold transition-transform hover:-translate-y-0.5"
            style={{
              backgroundColor: colors.primary,
              color: colors.secondary,
            }}
          >
            Browse the shop
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
      <h2
        className="font-heading mb-6 text-2xl font-bold md:text-3xl"
        style={{ color: colors.text }}
      >
        {heading}
      </h2>
      <StorefrontProductGrid
        products={displayProducts}
        layout={layout}
        colors={colors}
      />
    </div>
  );
}
