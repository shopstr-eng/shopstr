// SOURCE OF TRUTH — copied into packages/shopstr-mcp/src/generated/ at build time. Do not duplicate this logic elsewhere.
import type { Event } from "nostr-tools";
import {
  buildPricingBlock,
  getEffectiveShippingCost,
  parseShippingFromTags,
  parseShippingTag,
  type PricingBlock,
  type ShippingOptionsType,
} from "./product-tag-helpers.js";

export type NostrEvent = Event;
export type PriceStatus = "known" | "missing" | "invalid";

export type ProductImage = {
  url: string;
  dimensions?: string;
  order?: number;
};

export type ShippingOptionRef = {
  reference: string;
  extraCost?: number;
};

export type ProductParserLimits = {
  images?: number;
  categories?: number;
  sizes?: number;
  volumes?: number;
  weights?: number;
  bulk?: number;
  pickupLocations?: number;
  shippingOptions?: number;
};

export type ProductResponse = {
  id: string;
  pubkey: string;
  d?: string;
  title: string;
  summary: string;
  publishedAt?: string;
  images: ProductImage[];
  categories: string[];
  location: string;
  price?: number;
  currency?: string;
  priceStatus: PriceStatus;
  productType?: "simple" | "variable" | "variation";
  productFormat?: "digital" | "physical";
  visibility?: "hidden" | "on-sale" | "pre-order";
  shippingType?: ShippingOptionsType;
  shippingCost?: number;
  shippingOptions?: ShippingOptionRef[];
  stock?: number;
  quantity?: number;
  condition?: string;
  status?: string;
  sizes?: Array<{ size: string; quantity?: number }>;
  volumes?: Array<{ volume: string; price?: number }>;
  weights?: Array<{ weight: string; price?: number }>;
  bulk?: Array<{ units: number; price: number }>;
  pickupLocations?: string[];
  requiredCustomerInfo?: string;
  required?: string;
  restrictions?: string;
  expiration?: number;
  contentWarning?: boolean;
  createdAt: number;
  pricing?: PricingBlock;
  subscription: {
    enabled: boolean;
    discount?: number;
    frequencies: string[];
  };
};

export type ProfileResponse = {
  pubkey: string;
  kind: number;
  name: string;
  displayName: string;
  about: string;
  picture: string;
  banner: string;
  lud16: string;
  nip05: string;
  createdAt: number;
  website?: string;
  fiat_options?: unknown;
  payment_preference?: unknown;
  paymentMethodDiscounts?: unknown;
  freeShippingThreshold?: unknown;
  freeShippingCurrency?: string;
  storefront?: unknown;
  storefrontUrl?: string;
};

export type ReviewResponse = {
  id: string;
  pubkey: string;
  d?: string;
  content: string;
  ratings: Record<string, number>;
  createdAt: number;
  matchConfidence?: "legacy_fallback";
};

export {
  buildPricingBlock,
  getEffectiveShippingCost,
  parseShippingFromTags,
  parseShippingTag,
};

const CATEGORY_TAG_MAX_LENGTH = 100;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

function getTagValue(tags: string[][], key: string): string | undefined {
  return tags.find((tag) => tag[0] === key)?.[1];
}

function getTagValues(tags: string[][], key: string, limit?: number): string[] {
  const results: string[] = [];
  for (const tag of tags) {
    if (tag[0] !== key || !tag[1]) continue;
    results.push(tag[1]);
    if (limit !== undefined && results.length >= limit) break;
  }
  return results;
}

function parseCategoryTags(tags: string[][], limit?: number): string[] {
  const results: string[] = [];
  for (const tag of tags) {
    if (tag[0] !== "t" || !tag[1]) continue;
    const raw = tag[1];
    const normalized = raw.trim();
    if (
      normalized.length === 0 ||
      normalized.length > CATEGORY_TAG_MAX_LENGTH ||
      CONTROL_CHARACTER_PATTERN.test(normalized)
    ) {
      continue;
    }
    results.push(normalized);
    if (limit !== undefined && results.length >= limit) break;
  }
  return results;
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseNonNegativeInteger(
  value: string | undefined
): number | undefined {
  const parsed = parseNumber(value);
  if (parsed === undefined || parsed < 0 || !Number.isInteger(parsed)) return;
  return parsed;
}

function getImages(tags: string[][], limit?: number): ProductImage[] {
  const images: ProductImage[] = [];
  for (const tag of tags) {
    if (tag[0] !== "image" || !tag[1]) continue;
    const img: ProductImage = { url: tag[1] };
    if (tag[2] && tag[2] !== "") img.dimensions = tag[2];
    const order = parseNumber(tag[3]);
    if (order !== undefined) img.order = order;
    images.push(img);
    if (limit !== undefined && images.length >= limit) break;
  }
  return images;
}

function parseProductType(tags: string[][]): {
  productType: "simple" | "variable" | "variation";
  productFormat: "digital" | "physical";
} {
  const typeTag = tags.find((tag) => tag[0] === "type");
  const validTypes = ["simple", "variable", "variation"] as const;
  const validFormats = ["digital", "physical"] as const;

  const rawType = typeTag?.[1]?.toLowerCase();
  const rawFormat = typeTag?.[2]?.toLowerCase();

  return {
    productType: validTypes.includes(rawType as (typeof validTypes)[number])
      ? (rawType as (typeof validTypes)[number])
      : "simple",
    productFormat: validFormats.includes(
      rawFormat as (typeof validFormats)[number]
    )
      ? (rawFormat as (typeof validFormats)[number])
      : "digital",
  };
}

function parseSubscription(
  tags: string[][],
  priceTag: string[] | undefined
): { enabled: boolean; discount?: number; frequencies: string[] } {
  const gammaFrequency = priceTag?.[3]?.trim();
  const legacyEnabled = getTagValue(tags, "subscription") === "true";
  const legacyFrequencyTag = tags.find(
    (tag) => tag[0] === "subscription_frequency"
  );
  const legacyFrequencies = legacyFrequencyTag
    ? legacyFrequencyTag.slice(1)
    : [];
  const subscriptionDiscount = parseNumber(
    getTagValue(tags, "subscription_discount")
  );

  if (gammaFrequency) {
    return {
      enabled: true,
      ...(subscriptionDiscount !== undefined && {
        discount: subscriptionDiscount,
      }),
      frequencies: [
        gammaFrequency,
        ...legacyFrequencies.filter((f) => f !== gammaFrequency),
      ],
    };
  }

  return {
    enabled: legacyEnabled,
    ...(subscriptionDiscount !== undefined && {
      discount: subscriptionDiscount,
    }),
    frequencies: legacyFrequencies,
  };
}

export function parseProductEvent(event: NostrEvent): ProductResponse {
  return parseProductEventWithLimits(event);
}

export function parseProductEventWithLimits(
  event: NostrEvent,
  limits: ProductParserLimits = {}
): ProductResponse {
  const tags = event.tags || [];
  const priceTag = tags.find((tag) => tag[0] === "price");
  const parsedPrice = parseNumber(priceTag?.[1]);
  const validPrice =
    parsedPrice !== undefined && parsedPrice >= 0 ? parsedPrice : undefined;
  const hasValidPrice = validPrice !== undefined;
  const priceStatus: PriceStatus =
    priceTag === undefined ? "missing" : hasValidPrice ? "known" : "invalid";
  const currency = priceTag?.[2]?.trim() || undefined;
  const parsedShipping = parseShippingFromTags(tags);
  const gammaStock = parseNonNegativeInteger(getTagValue(tags, "stock"));
  const legacyQuantity = parseNonNegativeInteger(getTagValue(tags, "quantity"));
  const stock = gammaStock ?? legacyQuantity;

  const shippingOptions: ShippingOptionRef[] = [];
  for (const tag of tags) {
    if (tag[0] !== "shipping_option" || !tag[1]) continue;
    const ref: ShippingOptionRef = { reference: tag[1] };
    const extraCost = parseNumber(tag[2]);
    if (extraCost !== undefined && extraCost >= 0) ref.extraCost = extraCost;
    shippingOptions.push(ref);
    if (
      limits.shippingOptions !== undefined &&
      shippingOptions.length >= limits.shippingOptions
    ) {
      break;
    }
  }

  const rawVisibility = getTagValue(tags, "visibility")?.toLowerCase();
  const visibility: "hidden" | "on-sale" | "pre-order" =
    rawVisibility === "hidden" || rawVisibility === "pre-order"
      ? rawVisibility
      : "on-sale";
  const { productType, productFormat } = parseProductType(tags);

  const sizes: NonNullable<ProductResponse["sizes"]> = [];
  const volumes: NonNullable<ProductResponse["volumes"]> = [];
  const weights: NonNullable<ProductResponse["weights"]> = [];
  const bulk: NonNullable<ProductResponse["bulk"]> = [];

  for (const tag of tags) {
    if (tag[0] === "size" && tag[1]) {
      const quantity = parseNumber(tag[2]);
      if (limits.sizes === undefined || sizes.length < limits.sizes) {
        sizes.push({
          size: tag[1],
          ...(quantity !== undefined && { quantity }),
        });
      }
    } else if (tag[0] === "volume" && tag[1]) {
      const price = parseNumber(tag[2]);
      if (limits.volumes === undefined || volumes.length < limits.volumes) {
        volumes.push({
          volume: tag[1],
          ...(price !== undefined && { price }),
        });
      }
    } else if (tag[0] === "weight" && tag[1]) {
      const price = parseNumber(tag[2]);
      if (limits.weights === undefined || weights.length < limits.weights) {
        weights.push({
          weight: tag[1],
          ...(price !== undefined && { price }),
        });
      }
    } else if (tag[0] === "bulk" && tag[1] && tag[2]) {
      const units = parseNumber(tag[1]) ?? 0;
      const price = parseNumber(tag[2]) ?? 0;
      if (
        units > 0 &&
        price >= 0 &&
        (limits.bulk === undefined || bulk.length < limits.bulk)
      ) {
        bulk.push({ units, price });
      }
    }
  }

  const pickupLocations = getTagValues(
    tags,
    "pickup_location",
    limits.pickupLocations
  );
  const categories = parseCategoryTags(tags, limits.categories);
  const publishedAt = getTagValue(tags, "published_at");
  const expiration = parseNumber(getTagValue(tags, "valid_until"));
  const required = getTagValue(tags, "required") || undefined;
  const requiredCustomerInfo =
    getTagValue(tags, "required_customer_info") || undefined;
  const contentWarning = tags.some((tag) => {
    if (tag[0] === "content-warning") return true;
    if (tag[0] === "L" && tag[1] === "content-warning") return true;
    return tag[0] === "l" && tag[2] === "content-warning";
  });

  const subscription = parseSubscription(tags, priceTag);

  return {
    id: event.id,
    pubkey: event.pubkey,
    ...(getTagValue(tags, "d") && { d: getTagValue(tags, "d") }),
    title: getTagValue(tags, "title") || "",
    summary: getTagValue(tags, "summary") || "",
    ...(publishedAt && { publishedAt }),
    images: getImages(tags, limits.images),
    categories,
    location: getTagValue(tags, "location") || "",
    ...(hasValidPrice && { price: validPrice }),
    ...(currency && { currency }),
    priceStatus,
    productType,
    productFormat,
    visibility,
    ...(parsedShipping && { shippingType: parsedShipping.shippingType }),
    ...(parsedShipping && { shippingCost: parsedShipping.shippingCost }),
    ...(shippingOptions.length > 0 && { shippingOptions }),
    ...(stock !== undefined && { stock }),
    ...(legacyQuantity !== undefined && { quantity: legacyQuantity }),
    ...(getTagValue(tags, "condition") && {
      condition: getTagValue(tags, "condition"),
    }),
    ...(getTagValue(tags, "status") && { status: getTagValue(tags, "status") }),
    ...(sizes.length > 0 && { sizes }),
    ...(volumes.length > 0 && { volumes }),
    ...(weights.length > 0 && { weights }),
    ...(bulk.length > 0 && { bulk }),
    ...(pickupLocations.length > 0 && { pickupLocations }),
    ...((requiredCustomerInfo || required) && {
      requiredCustomerInfo: requiredCustomerInfo || required,
    }),
    ...((required || requiredCustomerInfo) && {
      required: required || requiredCustomerInfo,
    }),
    ...(getTagValue(tags, "restrictions") && {
      restrictions: getTagValue(tags, "restrictions"),
    }),
    ...(expiration !== undefined && { expiration }),
    ...(contentWarning && { contentWarning }),
    createdAt: event.created_at,
    ...(hasValidPrice && {
      pricing: buildPricingBlock(
        validPrice,
        currency ?? "sats",
        parsedShipping?.shippingType,
        parsedShipping?.shippingCost
      ),
    }),
    subscription,
  };
}

export function parseProfileEvent(event: NostrEvent): ProfileResponse {
  let content: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(event.content) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      content = parsed as Record<string, unknown>;
    }
  } catch {
    content = {};
  }

  const storefront = content.storefront;
  const response: ProfileResponse = {
    pubkey: event.pubkey,
    kind: event.kind,
    name: typeof content.name === "string" ? content.name : "",
    displayName:
      typeof content.display_name === "string" ? content.display_name : "",
    about: typeof content.about === "string" ? content.about : "",
    picture: typeof content.picture === "string" ? content.picture : "",
    banner: typeof content.banner === "string" ? content.banner : "",
    lud16: typeof content.lud16 === "string" ? content.lud16 : "",
    nip05: typeof content.nip05 === "string" ? content.nip05 : "",
    createdAt: event.created_at,
  };

  if (event.kind === 0) {
    if (typeof content.website === "string") response.website = content.website;
    if (content.fiat_options !== undefined)
      response.fiat_options = content.fiat_options;
    if (content.payment_preference !== undefined)
      response.payment_preference = content.payment_preference;
  }

  if (event.kind === 30019) {
    if (content.paymentMethodDiscounts !== undefined) {
      response.paymentMethodDiscounts = content.paymentMethodDiscounts;
    }
    if (content.freeShippingThreshold !== undefined) {
      response.freeShippingThreshold = content.freeShippingThreshold;
    }
    if (typeof content.freeShippingCurrency === "string") {
      response.freeShippingCurrency = content.freeShippingCurrency;
    }
    if (storefront !== undefined) {
      response.storefront = storefront;
      if (
        storefront &&
        typeof storefront === "object" &&
        !Array.isArray(storefront) &&
        typeof (storefront as { shopSlug?: unknown }).shopSlug === "string"
      ) {
        response.storefrontUrl = `/shop/${
          (storefront as { shopSlug: string }).shopSlug
        }`;
      }
    }
  }

  return response;
}

export function parseReviewEvent(
  event: NostrEvent,
  matchConfidence?: ReviewResponse["matchConfidence"]
): ReviewResponse {
  const tags = event.tags || [];
  const ratings: Record<string, number> = {};

  for (const ratingTag of tags.filter((tag) => tag[0] === "rating")) {
    const ratingType = ratingTag[2];
    const ratingValue = parseNumber(ratingTag[1]);
    if (ratingType && ratingValue !== undefined) {
      ratings[ratingType] = ratingValue;
    }
  }

  return {
    id: event.id,
    pubkey: event.pubkey,
    ...(getTagValue(tags, "d") && { d: getTagValue(tags, "d") }),
    content: event.content,
    ratings,
    createdAt: event.created_at,
    ...(matchConfidence && { matchConfidence }),
  };
}
