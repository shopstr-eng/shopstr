import { ShippingOptionsType } from "@/utils/STATIC-VARIABLES";
import { parseShippingTag } from "@/utils/parsers/product-tag-helpers";
import { NostrEvent } from "@/utils/types/types";

export type CanonicalSizeOption = {
  size: string;
  quantity?: number;
};

export type CanonicalVolumeOption = {
  volume: string;
  price?: number;
};

export type CanonicalWeightOption = {
  weight: string;
  price?: number;
};

export type CanonicalBulkTier = {
  units: number;
  price: number;
};

export type CanonicalProductData = {
  id: string;
  pubkey: string;
  createdAt: number;
  d?: string;
  title?: string;
  summary?: string;
  publishedAt?: string;
  images?: string[];
  categories?: string[];
  location?: string;
  price: number;
  currency?: string;
  shippingType?: ShippingOptionsType;
  shippingCost?: number;
  contentWarning: boolean;
  quantity?: number;
  sizes?: CanonicalSizeOption[];
  volumes?: CanonicalVolumeOption[];
  weights?: CanonicalWeightOption[];
  bulk?: CanonicalBulkTier[];
  condition?: string;
  status?: string;
  required?: string;
  requiredCustomerInfo?: string;
  restrictions?: string;
  pickupLocations?: string[];
  expiration?: number;
  subscriptionEnabled: boolean;
  subscriptionDiscount?: number;
  subscriptionFrequencies?: string[];
};

function parseNumber(value?: string): number | undefined {
  if (value == null || !String(value).trim()) {
    return;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return;
  }

  return parsed;
}

export function parseCanonicalProductEvent(
  productEvent: NostrEvent
): CanonicalProductData {
  const parsedData: CanonicalProductData = {
    id: productEvent.id,
    pubkey: productEvent.pubkey,
    createdAt: productEvent.created_at,
    price: 0,
    contentWarning: false,
    subscriptionEnabled: false,
  };

  const tags = productEvent.tags || [];

  tags.forEach((tag) => {
    const [key, ...values] = tag;

    switch (key) {
      case "title":
        parsedData.title = values[0] || undefined;
        break;
      case "summary":
        parsedData.summary = values[0] || undefined;
        break;
      case "published_at":
        parsedData.publishedAt = values[0] || undefined;
        break;
      case "image":
        if (values[0]) {
          if (!parsedData.images) parsedData.images = [];
          parsedData.images.push(values[0]);
        }
        break;
      case "t":
        if (values[0]) {
          if (!parsedData.categories) parsedData.categories = [];
          parsedData.categories.push(values[0]);
        }
        break;
      case "location":
        parsedData.location = values[0] || undefined;
        break;
      case "price": {
        const amount = parseNumber(values[0]);
        parsedData.price = amount ?? 0;
        parsedData.currency = values[1] || undefined;
        break;
      }
      case "shipping": {
        const parsedShipping = parseShippingTag(tag);
        if (parsedShipping) {
          parsedData.shippingType = parsedShipping.shippingType;
          parsedData.shippingCost = parsedShipping.shippingCost;
        }
        break;
      }
      case "d":
        parsedData.d = values[0];
        break;
      case "content-warning":
        parsedData.contentWarning = true;
        break;
      case "L":
        if (values[0] === "content-warning") {
          parsedData.contentWarning = true;
        }
        break;
      case "l":
        if (values[1] === "content-warning") {
          parsedData.contentWarning = true;
        }
        break;
      case "quantity": {
        const quantity = parseNumber(values[0]);
        if (quantity !== undefined) {
          parsedData.quantity = quantity;
        }
        break;
      }
      case "size": {
        const size = values[0];
        if (!size) break;
        if (!parsedData.sizes) parsedData.sizes = [];
        parsedData.sizes.push({
          size,
          quantity: parseNumber(values[1]),
        });
        break;
      }
      case "volume": {
        const volume = values[0];
        if (!volume) break;
        if (!parsedData.volumes) parsedData.volumes = [];
        parsedData.volumes.push({
          volume,
          price: parseNumber(values[1]),
        });
        break;
      }
      case "weight": {
        const weight = values[0];
        if (!weight) break;
        if (!parsedData.weights) parsedData.weights = [];
        parsedData.weights.push({
          weight,
          price: parseNumber(values[1]),
        });
        break;
      }
      case "bulk": {
        const units = parseNumber(values[0]);
        const price = parseNumber(values[1]);
        if (units !== undefined && price !== undefined) {
          if (!parsedData.bulk) parsedData.bulk = [];
          parsedData.bulk.push({ units, price });
        }
        break;
      }
      case "condition":
        parsedData.condition = values[0];
        break;
      case "status":
        parsedData.status = values[0];
        break;
      case "required":
        parsedData.required = values[0];
        break;
      case "required_customer_info":
        parsedData.requiredCustomerInfo = values[0];
        break;
      case "restrictions":
        parsedData.restrictions = values[0];
        break;
      case "pickup_location":
        if (values[0]) {
          if (!parsedData.pickupLocations) parsedData.pickupLocations = [];
          parsedData.pickupLocations.push(values[0]);
        }
        break;
      case "valid_until": {
        const expiration = parseNumber(values[0]);
        if (expiration !== undefined) {
          parsedData.expiration = expiration;
        }
        break;
      }
      case "subscription":
        parsedData.subscriptionEnabled = values[0] === "true";
        break;
      case "subscription_discount": {
        const discount = parseNumber(values[0]);
        if (discount !== undefined) {
          parsedData.subscriptionDiscount = discount;
        }
        break;
      }
      case "subscription_frequency": {
        const frequencies = values.filter(Boolean);
        if (frequencies.length > 0) {
          if (!parsedData.subscriptionFrequencies)
            parsedData.subscriptionFrequencies = [];
          parsedData.subscriptionFrequencies = frequencies;
        }
        break;
      }
      default:
        break;
    }
  });

  if (!parsedData.required && parsedData.requiredCustomerInfo) {
    parsedData.required = parsedData.requiredCustomerInfo;
  }
  if (!parsedData.requiredCustomerInfo && parsedData.required) {
    parsedData.requiredCustomerInfo = parsedData.required;
  }

  return parsedData;
}
