import {
  calculateTotalCost,
  type ShippingOptionsType,
} from "@/utils/parsers/product-tag-helpers";
import {
  parseProductEvent,
  type ProductResponse,
} from "@/utils/parsers/canonical-product-parser";
import { NostrEvent } from "@/utils/types/types";
import { normalizeProductImageUrls } from "@/utils/images";

export type ProductData = {
  id: string;
  pubkey: string;
  createdAt: number;
  title: string;
  summary: string;
  publishedAt: string;
  images: string[];
  categories: string[];
  location: string;
  price?: number;
  currency: string;
  priceStatus?: ProductResponse["priceStatus"];
  productType?: ProductResponse["productType"];
  productFormat?: ProductResponse["productFormat"];
  visibility?: ProductResponse["visibility"];
  shippingType?: ShippingOptionsType;
  shippingCost?: number;
  subscription?: ProductResponse["subscription"];
  totalCost: number;
  d?: string;
  contentWarning?: boolean;
  quantity?: number;
  stock?: number;
  sizes?: string[];
  sizeQuantities?: Map<string, number>;
  volumes?: string[];
  volumePrices?: Map<string, number>;
  weights?: string[];
  weightPrices?: Map<string, number>;
  condition?: string;
  status?: string;
  selectedSize?: string;
  selectedQuantity?: number;
  selectedVolume?: string;
  volumePrice?: number;
  selectedWeight?: string;
  weightPrice?: number;
  bulkPrices?: Map<number, number>;
  selectedBulkOption?: number;
  bulkPrice?: number;
  required?: string;
  requiredCustomerInfo?: string;
  restrictions?: string;
  pickupLocations?: string[];
  expiration?: number;
  rawEvent?: NostrEvent;
};

export function buildUiVariantMaps(product: ProductResponse) {
  const sizes = product.sizes?.map((entry) => entry.size) ?? [];
  const sizeQuantities = new Map<string, number>();
  for (const entry of product.sizes ?? []) {
    if (entry.quantity !== undefined) {
      sizeQuantities.set(entry.size, entry.quantity);
    }
  }

  const volumes = product.volumes?.map((entry) => entry.volume) ?? [];
  const volumePrices = new Map<string, number>();
  for (const entry of product.volumes ?? []) {
    if (entry.price !== undefined) {
      volumePrices.set(entry.volume, entry.price);
    }
  }

  const weights = product.weights?.map((entry) => entry.weight) ?? [];
  const weightPrices = new Map<string, number>();
  for (const entry of product.weights ?? []) {
    if (entry.price !== undefined) {
      weightPrices.set(entry.weight, entry.price);
    }
  }

  const bulkPrices = new Map<number, number>();
  for (const entry of product.bulk ?? []) {
    bulkPrices.set(entry.units, entry.price);
  }

  return {
    sizes,
    sizeQuantities,
    volumes,
    volumePrices,
    weights,
    weightPrices,
    bulkPrices,
  };
}

export const parseTags = (
  productEvent: NostrEvent
): ProductData | undefined => {
  if (productEvent.tags === undefined) return;

  const product = parseProductEvent(productEvent);
  const variantMaps = buildUiVariantMaps(product);
  const summary = productEvent.content?.trim()
    ? productEvent.content
    : product.summary;

  const parsedData: ProductData = {
    id: product.id,
    pubkey: product.pubkey,
    createdAt: product.createdAt,
    title: product.title,
    summary,
    publishedAt: product.publishedAt ?? "",
    images: product.images.map((image) => image.url),
    categories: product.categories,
    location: product.location,
    ...(product.price !== undefined && { price: product.price }),
    currency: product.currency ?? "",
    priceStatus: product.priceStatus,
    productType: product.productType,
    productFormat: product.productFormat,
    visibility: product.visibility,
    ...(product.shippingType && { shippingType: product.shippingType }),
    ...(product.shippingCost !== undefined && {
      shippingCost: product.shippingCost,
    }),
    subscription: product.subscription,
    totalCost: 0,
    ...(product.d && { d: product.d }),
    ...(product.contentWarning && { contentWarning: product.contentWarning }),
    ...(product.quantity !== undefined && { quantity: product.quantity }),
    ...(product.stock !== undefined && { stock: product.stock }),
    sizes: variantMaps.sizes,
    sizeQuantities: variantMaps.sizeQuantities,
    volumes: variantMaps.volumes,
    volumePrices: variantMaps.volumePrices,
    weights: variantMaps.weights,
    weightPrices: variantMaps.weightPrices,
    bulkPrices: variantMaps.bulkPrices,
    ...(product.condition && { condition: product.condition }),
    ...(product.status && { status: product.status }),
    ...(product.required && { required: product.required }),
    ...(product.requiredCustomerInfo && {
      requiredCustomerInfo: product.requiredCustomerInfo,
    }),
    ...(product.restrictions && { restrictions: product.restrictions }),
    ...(product.pickupLocations && {
      pickupLocations: product.pickupLocations,
    }),
    ...(product.expiration !== undefined && { expiration: product.expiration }),
    rawEvent: productEvent,
  };
  parsedData.images = normalizeProductImageUrls(parsedData.images);
  parsedData.totalCost = calculateTotalCost(parsedData);
  return parsedData;
};

export default parseTags;
