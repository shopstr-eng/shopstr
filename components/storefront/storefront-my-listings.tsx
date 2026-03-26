import { StorefrontColorScheme } from "@/utils/types/types";
import { useContext, useMemo } from "react";
import { ProductContext } from "@/utils/context/context";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import ProductCard from "@/components/utility-components/product-card";
import { getListingSlug } from "@/utils/url-slugs";

interface StorefrontMyListingsProps {
  shopPubkey: string;
  colors: StorefrontColorScheme;
}

export default function StorefrontMyListings({
  shopPubkey,
  colors,
}: StorefrontMyListingsProps) {
  const productContext = useContext(ProductContext);

  const sellerProducts = useMemo(() => {
    if (!shopPubkey || !productContext.productEvents.length) return [];
    return productContext.productEvents
      .filter((event: any) => event.pubkey === shopPubkey)
      .map((event: any) => parseTags(event))
      .filter((p: ProductData | undefined) => p !== undefined) as ProductData[];
  }, [shopPubkey, productContext.productEvents]);

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: colors.background }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1
          className="font-heading mb-6 text-3xl font-bold"
          style={{ color: colors.text }}
        >
          My Listings
        </h1>
        {sellerProducts.length === 0 ? (
          <p className="text-lg opacity-50">No listings yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sellerProducts.map((product) => {
              const slug = getListingSlug(product, sellerProducts);
              return (
                <ProductCard
                  key={product.id || product.d}
                  productData={product}
                  href={`/listing/${slug}`}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
