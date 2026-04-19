import { CanonicalProductData } from "./base-parser";

export type McpProductData = {
  id: string;
  pubkey: string;
  d?: string;
  title: string;
  summary: string;
  images: string[];
  categories: string[];
  location: string;
  price: number;
  currency: string;
  shippingType?: string;
  shippingCost?: number;
  quantity?: number;
  condition?: string;
  status?: string;
  sizes?: Array<{ size: string; quantity?: number }>;
  volumes?: Array<{ volume: string; price?: number }>;
  weights?: Array<{ weight: string; price?: number }>;
  bulk?: Array<{ units: number; price: number }>;
  pickupLocations?: string[];
  requiredCustomerInfo?: string;
  createdAt: number;
  publishedAt?: string;
  validUntil?: number;
  contentWarning?: boolean;
  restrictions?: string;
  subscription: {
    enabled: boolean;
    discount?: number;
    frequencies: string[];
  };
};

export function toMcpProductData(
  canonical: CanonicalProductData
): McpProductData {
  const {
    expiration,
    required,
    requiredCustomerInfo,
    subscriptionEnabled,
    subscriptionDiscount,
    subscriptionFrequencies,
    ...mcpCompatibleFields
  } = canonical;

  return {
    ...mcpCompatibleFields,
    title: canonical.title ?? "",
    summary: canonical.summary ?? "",
    images: [...(canonical.images ?? [])],
    categories: [...(canonical.categories ?? [])],
    location: canonical.location ?? "",
    currency: canonical.currency ?? "",
    sizes:
      canonical.sizes && canonical.sizes.length > 0
        ? canonical.sizes.map((s) => ({ size: s.size, quantity: s.quantity }))
        : undefined,
    volumes:
      canonical.volumes && canonical.volumes.length > 0
        ? canonical.volumes.map((v) => ({ volume: v.volume, price: v.price }))
        : undefined,
    weights:
      canonical.weights && canonical.weights.length > 0
        ? canonical.weights.map((w) => ({ weight: w.weight, price: w.price }))
        : undefined,
    bulk:
      canonical.bulk && canonical.bulk.length > 0
        ? canonical.bulk.map((tier) => ({
            units: tier.units,
            price: tier.price,
          }))
        : undefined,
    pickupLocations:
      canonical.pickupLocations && canonical.pickupLocations.length > 0
        ? [...canonical.pickupLocations]
        : undefined,
    requiredCustomerInfo: requiredCustomerInfo ?? required,
    publishedAt: canonical.publishedAt || undefined,
    validUntil: expiration,
    contentWarning: canonical.contentWarning || undefined,
    subscription: {
      enabled: subscriptionEnabled,
      discount: subscriptionDiscount,
      frequencies: [...(subscriptionFrequencies ?? [])],
    },
  };
}
