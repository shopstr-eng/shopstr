import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import StorefrontProductGrid from "../storefront-product-grid";
import { ProductData } from "@/utils/parsers/product-parser-functions";

interface SectionProductsProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
  products: ProductData[];
  isPreview?: boolean;
}

export default function SectionProducts({
  section,
  colors,
  products,
  isPreview,
}: SectionProductsProps) {
  const layout = section.productLayout || "grid";
  const limit = section.productLimit;
  const displayProducts = limit ? products.slice(0, limit) : products;

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
      {section.heading && (
        <h2
          className="font-heading mb-8 text-3xl font-bold"
          style={{ color: "var(--sf-text)" }}
        >
          {section.heading}
        </h2>
      )}
      {section.subheading && (
        <p className="font-body mb-8 text-lg opacity-70">
          {section.subheading}
        </p>
      )}
      {isPreview ? (
        <PreviewProductGridInline
          products={displayProducts}
          layout={layout}
          colors={colors}
        />
      ) : (
        <StorefrontProductGrid
          products={displayProducts}
          layout={layout}
          colors={colors}
        />
      )}
    </div>
  );
}

function PreviewProductGridInline({
  products,
  layout,
  colors,
}: {
  products: ProductData[];
  layout: "grid" | "list" | "featured";
  colors: StorefrontColorScheme;
}) {
  const featuredProduct =
    layout === "featured" && products.length > 0 ? products[0] : null;
  const remaining = layout === "featured" ? products.slice(1) : products;

  return (
    <div id="products">
      {layout === "featured" && featuredProduct && (
        <div
          className="mb-8 overflow-hidden rounded-xl border-2"
          style={{ borderColor: colors.primary + "33" }}
        >
          <div className="md:flex">
            {featuredProduct.images?.[0] && (
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
              <h2 className="font-heading text-2xl font-bold md:text-3xl">
                {featuredProduct.title}
              </h2>
              <p className="font-body mt-3 opacity-70">
                {featuredProduct.summary}
              </p>
              <div className="mt-4">
                <span
                  className="text-2xl font-bold"
                  style={{ color: colors.accent }}
                >
                  ${featuredProduct.price}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      <div
        className={
          layout === "list"
            ? "space-y-4"
            : "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {remaining.map((product) =>
          layout === "list" ? (
            <div
              key={product.id}
              className="flex gap-4 overflow-hidden rounded-xl border-2 p-4"
              style={{ borderColor: colors.primary + "22" }}
            >
              {product.images?.[0] && (
                <img
                  src={product.images[0]}
                  alt={product.title}
                  className="h-24 w-24 flex-shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="flex flex-1 flex-col justify-center">
                <h3 className="font-heading text-base font-bold">
                  {product.title}
                </h3>
                <p className="font-body mt-1 line-clamp-2 text-sm opacity-60">
                  {product.summary}
                </p>
                <span
                  className="mt-2 text-base font-bold"
                  style={{ color: colors.accent }}
                >
                  ${product.price}
                </span>
              </div>
            </div>
          ) : (
            <div
              key={product.id}
              className="overflow-hidden rounded-xl border-2 transition-shadow hover:shadow-lg"
              style={{ borderColor: colors.primary + "22" }}
            >
              {product.images?.[0] && (
                <div className="aspect-square overflow-hidden">
                  <img
                    src={product.images[0]}
                    alt={product.title}
                    className="h-full w-full object-cover transition-transform hover:scale-105"
                  />
                </div>
              )}
              <div className="p-4">
                <h3 className="font-heading line-clamp-1 text-base font-bold">
                  {product.title}
                </h3>
                <p className="font-body mt-1 line-clamp-2 text-sm opacity-60">
                  {product.summary}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span
                    className="text-lg font-bold"
                    style={{ color: colors.accent }}
                  >
                    ${product.price}
                  </span>
                  {product.categories?.[0] && (
                    <span
                      className="rounded-full px-3 py-1 text-xs font-bold"
                      style={{
                        backgroundColor: colors.primary + "22",
                        color: colors.primary,
                      }}
                    >
                      {product.categories[0]}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
