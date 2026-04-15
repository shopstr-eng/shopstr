import { useState, useMemo } from "react";
import { StorefrontColorScheme } from "@/utils/types/types";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import ProductCard from "@/components/utility-components/product-card";
import { getListingSlug } from "@/utils/url-slugs";
import { Pagination } from "@heroui/react";
import { CATEGORIES } from "@/utils/STATIC-VARIABLES";
import {
  productSatisfiesSearchFilter,
  productSatisfiesCategoryFilter,
  productSatisfiesLocationFilter,
} from "@/utils/parsers/product-filter-helpers";

interface StorefrontShopPageProps {
  products: ProductData[];
  colors: StorefrontColorScheme;
  shopName: string;
}

const ITEMS_PER_PAGE = 24;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
  { value: "name-az", label: "Name: A–Z" },
  { value: "name-za", label: "Name: Z–A" },
];

export default function StorefrontShopPage({
  products,
  colors,
  shopName,
}: StorefrontShopPageProps) {
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set()
  );
  const [selectedLocation, setSelectedLocation] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [currentPage, setCurrentPage] = useState(1);

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      p.categories?.forEach((c) => cats.add(c));
    });
    return CATEGORIES.filter((c) => cats.has(c));
  }, [products]);

  const availableLocations = useMemo(() => {
    const locs = new Set<string>();
    products.forEach((p) => {
      if (p.location) locs.add(p.location);
    });
    return Array.from(locs).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products.filter((p) => {
      if (!productSatisfiesSearchFilter(p, search)) return false;
      if (!productSatisfiesCategoryFilter(p, selectedCategories)) return false;
      if (!productSatisfiesLocationFilter(p, selectedLocation)) return false;
      return true;
    });

    switch (sortBy) {
      case "oldest":
        result = [...result].sort(
          (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
        );
        break;
      case "newest":
        result = [...result].sort(
          (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
        );
        break;
      case "price-low":
        result = [...result].sort(
          (a, b) => (a.totalCost || 0) - (b.totalCost || 0)
        );
        break;
      case "price-high":
        result = [...result].sort(
          (a, b) => (b.totalCost || 0) - (a.totalCost || 0)
        );
        break;
      case "name-az":
        result = [...result].sort((a, b) =>
          (a.title || "").localeCompare(b.title || "")
        );
        break;
      case "name-za":
        result = [...result].sort((a, b) =>
          (b.title || "").localeCompare(a.title || "")
        );
        break;
    }

    return result;
  }, [products, search, selectedCategories, selectedLocation, sortBy]);

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const visibleProducts = filteredProducts.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  const handleCategoryToggle = (cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedCategories(new Set());
    setSelectedLocation("");
    setSortBy("newest");
    setCurrentPage(1);
  };

  const hasActiveFilters =
    search || selectedCategories.size > 0 || selectedLocation;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-20 pb-12 md:px-6">
      <h1
        className="font-heading mb-6 text-2xl font-bold md:text-3xl"
        style={{ color: colors.text }}
      >
        Shop
      </h1>

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search products..."
            className="w-full rounded-lg border-2 px-4 py-2.5 pl-10 text-sm transition-colors outline-none focus:ring-2"
            style={{
              borderColor: colors.primary + "44",
              backgroundColor: colors.background,
              color: colors.text,
            }}
          />
          <svg
            className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 opacity-40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            style={{ color: colors.text }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <div className="flex gap-2">
          {availableLocations.length > 0 && (
            <select
              value={selectedLocation}
              onChange={(e) => {
                setSelectedLocation(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded-lg border-2 px-3 py-2.5 text-sm outline-none"
              style={{
                borderColor: colors.primary + "44",
                backgroundColor: colors.background,
                color: colors.text,
              }}
            >
              <option value="">All Locations</option>
              {availableLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          )}

          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-lg border-2 px-3 py-2.5 text-sm outline-none"
            style={{
              borderColor: colors.primary + "44",
              backgroundColor: colors.background,
              color: colors.text,
            }}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {availableCategories.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {availableCategories.map((cat) => {
            const isSelected = selectedCategories.has(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => handleCategoryToggle(cat)}
                className="rounded-full border-2 px-3 py-1 text-sm font-medium transition-all"
                style={{
                  borderColor: isSelected
                    ? colors.primary
                    : colors.primary + "33",
                  backgroundColor: isSelected ? colors.primary : "transparent",
                  color: isSelected ? colors.background : colors.text + "CC",
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {hasActiveFilters && (
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm" style={{ color: colors.text + "99" }}>
            {filteredProducts.length} product
            {filteredProducts.length !== 1 ? "s" : ""} found
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm font-medium underline"
            style={{ color: colors.primary }}
          >
            Clear filters
          </button>
        </div>
      )}

      {visibleProducts.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg" style={{ color: colors.text + "80" }}>
            {hasActiveFilters
              ? "No products match your filters."
              : "No products available yet."}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-sm font-medium underline"
              style={{ color: colors.primary }}
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProducts.map((product) => {
            const slug = getListingSlug(product, products);
            const href = `/listing/${slug}`;
            return (
              <div key={product.id || product.d}>
                <ProductCard productData={product} href={href} />
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex justify-center">
          <Pagination
            total={totalPages}
            page={currentPage}
            onChange={setCurrentPage}
            showControls
            classNames={{
              cursor: "text-white font-bold",
            }}
            style={{
              // @ts-expect-error CSS custom property for HeroUI theme color
              "--heroui-primary": colors.accent,
            }}
          />
        </div>
      )}
    </div>
  );
}
