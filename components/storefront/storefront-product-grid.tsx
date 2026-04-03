import { StorefrontColorScheme } from "@/utils/types/types";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import ProductCard from "@/components/utility-components/product-card";
import { getListingSlug } from "@/utils/url-slugs";
import { useState } from "react";
import { Pagination } from "@nextui-org/react";
import { getNavTextColor } from "@/utils/storefront-colors";

interface StorefrontProductGridProps {
  products: ProductData[];
  layout: "grid" | "list" | "featured";
  colors: StorefrontColorScheme;
}

const ITEMS_PER_PAGE = 24;

export default function StorefrontProductGrid({
  products,
  layout,
  colors,
}: StorefrontProductGridProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(products.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const visibleProducts = products.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  const featuredProduct =
    layout === "featured" && products.length > 0 ? products[0] : null;
  const remainingProducts =
    layout === "featured" ? visibleProducts.slice(1) : visibleProducts;

  if (products.length === 0) {
    return (
      <div id="products" className="py-16 text-center">
        <p className="text-lg opacity-50">No products available yet.</p>
      </div>
    );
  }

  return (
    <div id="products">
      {layout === "featured" && featuredProduct && (
        <div
          className="mb-8 overflow-hidden rounded-xl border-2"
          style={{ borderColor: colors.primary + "33" }}
        >
          <div className="md:flex">
            {featuredProduct.images && featuredProduct.images.length > 0 && (
              <div className="md:w-1/2">
                <img
                  src={featuredProduct.images[0]}
                  alt={featuredProduct.title}
                  className="h-64 w-full object-cover md:h-full"
                />
              </div>
            )}
            <div className="flex flex-col justify-center p-8 md:w-1/2">
              <span
                className="mb-2 text-sm font-semibold uppercase tracking-wider"
                style={{ color: colors.accent }}
              >
                Featured
              </span>
              <h2 className="text-2xl font-bold md:text-3xl">
                {featuredProduct.title}
              </h2>
              {featuredProduct.summary && (
                <p className="mt-3 opacity-70">{featuredProduct.summary}</p>
              )}
              <div className="mt-4">
                <span
                  className="text-2xl font-bold"
                  style={{ color: colors.accent }}
                >
                  {featuredProduct.currency === "sat" ||
                  featuredProduct.currency === "sats"
                    ? `${featuredProduct.totalCost} sats`
                    : `${featuredProduct.totalCost} ${
                        featuredProduct.currency?.toUpperCase() || "USD"
                      }`}
                </span>
              </div>
              <a
                href={`/listing/${getListingSlug(featuredProduct, products)}`}
                className="mt-6 inline-block rounded-lg px-6 py-3 text-center font-bold transition-transform hover:-translate-y-0.5"
                style={{
                  backgroundColor: colors.primary,
                  color: colors.secondary,
                }}
              >
                View Product
              </a>
            </div>
          </div>
        </div>
      )}

      <div
        className={
          layout === "list"
            ? "flex flex-col gap-4"
            : "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {remainingProducts.map((product) => {
          const slug = getListingSlug(product, products);
          const href = `/listing/${slug}`;
          return (
            <div key={product.id || product.d}>
              <ProductCard productData={product} href={href} />
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="mt-8 flex justify-center">
          <Pagination
            total={totalPages}
            page={currentPage}
            onChange={setCurrentPage}
            showControls
            classNames={{
              cursor: `font-bold ${
                getNavTextColor(colors.accent) === "#1a1a1a"
                  ? "text-gray-900"
                  : "text-white"
              }`,
            }}
            style={{
              // @ts-expect-error CSS custom property is intentionally injected for theming.
              "--nextui-primary": colors.accent,
            }}
          />
        </div>
      )}
    </div>
  );
}
