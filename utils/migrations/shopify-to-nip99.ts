import type { ShopifyProduct } from "./shopify-csv-parser";
import type { ProductFormValues } from "@/utils/types/types";
import CryptoJS from "crypto-js";

export interface ShopifyMigrationOptions {
  pubkey: string;
  relayHint: string;
  defaultCurrency: string;
  defaultCategory: string;
  defaultLocation: string;
  defaultShippingOption: string;
  defaultShippingCost: string;
  pickupLocations?: string[];
  /**
   * Whether to import only products marked Active/Published in Shopify, or all.
   */
  includeDrafts?: boolean;
}

export interface BuiltShopifyListing {
  product: ShopifyProduct;
  values: ProductFormValues;
  warnings: string[];
}

const SHOPIFY_TO_MM_STATUS: Record<string, string> = {
  active: "active",
  draft: "inactive",
  archived: "inactive",
  inactive: "inactive",
};

const stripHtml = (html: string): string => {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const isHttpImage = (url: string): boolean => {
  if (!url) return false;
  return /^https?:\/\//i.test(url) && !url.includes(" ");
};

const sanitizeTag = (tag: string): string =>
  tag
    .replace(/[#\s]+/g, " ")
    .trim()
    .slice(0, 50);

const variantLabel = (optionValues: string[]): string => {
  if (optionValues.length === 0) return "";
  if (optionValues.length === 1) return optionValues[0]!;
  // Use values only (e.g., "Small / Green") to keep it readable
  return optionValues.join(" / ");
};

/**
 * Build the ProductFormValues array (NIP-99 kind 30402 tags) for a single
 * Shopify product. Returns warnings for things that could not be mapped.
 */
export function buildListingFromShopifyProduct(
  product: ShopifyProduct,
  options: ShopifyMigrationOptions
): BuiltShopifyListing {
  const warnings: string[] = [];
  const {
    pubkey,
    relayHint,
    defaultCurrency,
    defaultCategory,
    defaultLocation,
    defaultShippingOption,
    defaultShippingCost,
    pickupLocations,
  } = options;

  const title = product.title || product.handle;
  const description = stripHtml(product.description) || title;

  // d-tag: stable hash of title (matches existing product-form behaviour)
  const dTag = CryptoJS.SHA256(title).toString(CryptoJS.enc.Hex);

  // Determine canonical price: prefer first variant price, else 0
  const firstVariantWithPrice = product.variants.find(
    (v) => v.price && parseFloat(v.price) > 0
  );
  const priceStr = firstVariantWithPrice?.price || "0";
  const price = parseFloat(priceStr);
  if (!Number.isFinite(price) || price <= 0) {
    warnings.push(
      `"${title}": no valid price found, defaulting to 0 ${defaultCurrency}.`
    );
  }

  const currency = defaultCurrency;

  // Map Shopify status to MM status
  const mmStatus =
    SHOPIFY_TO_MM_STATUS[(product.status || "active").toLowerCase()] ||
    "active";

  // Validate images
  const validImages = product.imageUrls.filter(isHttpImage);
  if (validImages.length === 0) {
    warnings.push(
      `"${title}": no public image URLs found in the export. The listing will be created without images and you will need to add them manually before publishing.`
    );
  }

  // Build tags from product tags + product type + vendor
  const seenTags = new Set<string>();
  const extraTags: string[] = [];
  const pushTag = (raw: string) => {
    const t = sanitizeTag(raw);
    if (!t) return;
    const key = t.toLowerCase();
    if (seenTags.has(key)) return;
    seenTags.add(key);
    extraTags.push(t);
  };
  product.tags.forEach(pushTag);
  if (product.type) pushTag(product.type);
  if (product.vendor) pushTag(product.vendor);

  // Determine total inventory across variants (used as fallback quantity)
  const totalInventory = product.variants.reduce(
    (sum, v) => sum + (v.inventoryQuantity || 0),
    0
  );

  // Variant handling: if variants have meaningful options AND more than 1
  // variant, use size tags (key = composite label).
  const useSizes =
    product.variants.length > 1 &&
    product.variants.some((v) => v.optionValues.length > 0);

  // Determine if any variant requires shipping; if all variants explicitly
  // don't require shipping, treat as digital -> N/A
  const anyRequiresShipping = product.variants.some((v) => v.requiresShipping);
  const shippingOption = anyRequiresShipping
    ? defaultShippingOption
    : product.variants.length > 0
      ? "N/A"
      : defaultShippingOption;

  const tags: ProductFormValues = [
    ["d", dTag],
    ["alt", "Product listing: " + title],
    ["client", "Milk Market", "31990:" + pubkey + ":" + dTag, relayHint],
    ["title", title],
    ["summary", description],
    ["price", price.toFixed(2), currency],
    ["location", defaultLocation],
    [
      "shipping",
      shippingOption,
      shippingOption === "Added Cost" || shippingOption === "Added Cost/Pickup"
        ? defaultShippingCost || "0"
        : "0",
      currency,
    ],
  ];

  validImages.forEach((img) => tags.push(["image", img]));

  // Default Milk Market category + housekeeping tags
  if (defaultCategory) tags.push(["t", defaultCategory]);
  tags.push(["t", "MilkMarket"]);
  tags.push(["t", "FREEMILK"]);

  // Optional: import original Shopify tags as t-tags too (keep listings searchable)
  extraTags.forEach((t) => tags.push(["t", t]));

  // Quantity / size handling
  if (useSizes) {
    const seenLabels = new Set<string>();
    product.variants.forEach((v) => {
      const label = variantLabel(v.optionValues);
      if (!label) return;
      if (seenLabels.has(label)) return;
      seenLabels.add(label);
      tags.push(["size", label, String(v.inventoryQuantity || 0)]);
    });
    // Also publish the aggregate quantity
    tags.push(["quantity", String(totalInventory)]);
  } else if (totalInventory > 0) {
    tags.push(["quantity", String(totalInventory)]);
  }

  // Condition (Google Shopping)
  if (product.googleCondition) {
    tags.push(["condition", product.googleCondition]);
  }

  // Status
  tags.push(["status", mmStatus]);

  // Pickup locations if shipping option includes pickup
  if (
    pickupLocations &&
    pickupLocations.length > 0 &&
    (shippingOption === "Pickup" ||
      shippingOption === "Free/Pickup" ||
      shippingOption === "Added Cost/Pickup")
  ) {
    pickupLocations
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((loc) => tags.push(["pickup_location", loc]));
  }

  return { product, values: tags, warnings };
}

export function buildListingsFromShopifyProducts(
  products: ShopifyProduct[],
  options: ShopifyMigrationOptions
): BuiltShopifyListing[] {
  const filtered = options.includeDrafts
    ? products
    : products.filter((p) => {
        const status = (p.status || "active").toLowerCase();
        return status === "active";
      });
  return filtered.map((p) => buildListingFromShopifyProduct(p, options));
}
