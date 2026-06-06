import type {
  NostrEvent,
  PriceStatus,
  PricingBlock,
  ProductImage,
  ProductResponse,
  ProfileResponse,
  ReviewResponse,
  ShippingOptionRef,
  ShippingOptionsType,
} from "./types.js";

const SHIPPING_OPTIONS = [
  "N/A",
  "Free",
  "Pickup",
  "Free/Pickup",
  "Added Cost",
] as const satisfies readonly ShippingOptionsType[];

type ParsedShippingTag = {
  shippingType: ShippingOptionsType;
  shippingCost: number;
};

//  Maximum number of repeated tags we will extract per field.
const TAG_CAPS = {
  image: 10,
  t: 20,
  size: 50,
  volume: 50,
  weight: 50,
  bulk: 50,
  pickup_location: 20,
  shipping_option: 10,
} as const;

function getTagValue(tags: string[][], key: string): string | undefined {
  return tags.find((tag) => tag[0] === key)?.[1];
}

function getCappedTagValues(
  tags: string[][],
  key: string,
  cap: number
): string[] {
  const results: string[] = [];
  for (const tag of tags) {
    if (results.length >= cap) break;
    if (tag[0] === key && tag[1]) results.push(tag[1]);
  }
  return results;
}

//  Extract capped, structured image objects from image tags according to Gamma spec: ["image", "<url>", "<dimensions>", "<sorting-order>"]
function getCappedImages(tags: string[][]): ProductImage[] {
  const images: ProductImage[] = [];
  for (const tag of tags) {
    if (images.length >= TAG_CAPS.image) break;
    if (tag[0] !== "image" || !tag[1]) continue;
    const img: ProductImage = { url: tag[1] };
    if (tag[2] && tag[2] !== "") img.dimensions = tag[2];
    const order = parseNumber(tag[3]);
    if (order !== undefined) img.order = order;
    images.push(img);
  }
  return images;
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

export function parseShippingTag(
  tag?: string[]
): ParsedShippingTag | undefined {
  if (!tag || tag[0] !== "shipping" || tag.length !== 4) return;

  const [, shippingType, rawShippingCost, shippingCurrency] = tag;
  if (
    !shippingType ||
    !shippingCurrency ||
    !SHIPPING_OPTIONS.includes(shippingType as ShippingOptionsType)
  ) {
    return;
  }

  const shippingCost = parseNumber(rawShippingCost);
  if (shippingCost === undefined || shippingCost < 0) return;

  return {
    shippingType: shippingType as ShippingOptionsType,
    shippingCost,
  };
}

export function parseShippingFromTags(
  tags: string[][]
): ParsedShippingTag | undefined {
  let parsedShipping: ParsedShippingTag | undefined;

  for (const tag of tags) {
    if (tag[0] !== "shipping") continue;
    parsedShipping = parseShippingTag(tag) ?? parsedShipping;
  }

  return parsedShipping;
}

export function getEffectiveShippingCost(
  shippingType?: string,
  shippingCost?: number
): number | null {
  if (!shippingType) return null;
  if (
    shippingType === "Free" ||
    shippingType === "Free/Pickup" ||
    shippingType === "Pickup" ||
    shippingType === "N/A"
  ) {
    return 0;
  }
  if (
    typeof shippingCost !== "number" ||
    !Number.isFinite(shippingCost) ||
    shippingCost < 0
  ) {
    return null;
  }
  return shippingCost;
}

export function buildPricingBlock(
  price: number,
  currency: string,
  shippingType?: ShippingOptionsType,
  shippingCost?: number,
  quantity = 1,
  paymentMethods: string[] = ["lightning", "cashu"]
): PricingBlock {
  const effectiveShippingCost = getEffectiveShippingCost(
    shippingType,
    shippingCost
  );
  return {
    amount: price,
    currency: currency || "sats",
    unit: "per item",
    shippingCost: effectiveShippingCost,
    shippingType: shippingType || "N/A",
    totalEstimate: price * quantity + (effectiveShippingCost ?? 0),
    paymentMethods,
  };
}

/**
 * Parse the product type tag: ["type", "simple|variable|variation", "digital|physical"]
 * Defaults: simple, digital (per Gamma spec).
 */
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
  // Gamma spec: frequency is the 4th element of the price tag
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
  // Gamma spec: stock tag, with fallback to legacy quantity
  const gammaStock = parseNonNegativeInteger(getTagValue(tags, "stock"));
  const legacyQuantity = parseNonNegativeInteger(getTagValue(tags, "quantity"));
  const stock = gammaStock ?? legacyQuantity;

  // Gamma spec: structured shipping_option with extra cost
  const shippingOptions: ShippingOptionRef[] = [];
  for (const tag of tags) {
    if (shippingOptions.length >= TAG_CAPS.shipping_option) break;
    if (tag[0] !== "shipping_option" || !tag[1]) continue;
    const ref: ShippingOptionRef = { reference: tag[1] };
    const extraCost = parseNumber(tag[2]);
    if (extraCost !== undefined && extraCost >= 0) ref.extraCost = extraCost;
    shippingOptions.push(ref);
  }

  // Gamma spec: visibility (default: on-sale)
  const rawVisibility = getTagValue(tags, "visibility")?.toLowerCase();
  const visibility: "hidden" | "on-sale" | "pre-order" =
    rawVisibility === "hidden" || rawVisibility === "pre-order"
      ? rawVisibility
      : "on-sale";

  // Gamma spec: product type and format
  const { productType, productFormat } = parseProductType(tags);

  // Gamma spec: structured images with dimensions and sorting
  const images = getCappedImages(tags);

  const sizes = tags
    .filter((tag) => tag[0] === "size" && tag[1])
    .slice(0, TAG_CAPS.size)
    .map((tag) => ({
      size: tag[1] as string,
      ...(parseNumber(tag[2]) !== undefined && {
        quantity: parseNumber(tag[2]),
      }),
    }));

  const volumes = tags
    .filter((tag) => tag[0] === "volume" && tag[1])
    .slice(0, TAG_CAPS.volume)
    .map((tag) => ({
      volume: tag[1] as string,
      ...(parseNumber(tag[2]) !== undefined && { price: parseNumber(tag[2]) }),
    }));

  const weights = tags
    .filter((tag) => tag[0] === "weight" && tag[1])
    .slice(0, TAG_CAPS.weight)
    .map((tag) => ({
      weight: tag[1] as string,
      ...(parseNumber(tag[2]) !== undefined && { price: parseNumber(tag[2]) }),
    }));

  const bulk = tags
    .filter((tag) => tag[0] === "bulk" && tag[1] && tag[2])
    .slice(0, TAG_CAPS.bulk)
    .map((tag) => ({
      units: parseNumber(tag[1]) ?? 0,
      price: parseNumber(tag[2]) ?? 0,
    }))
    .filter((entry) => entry.units > 0 && entry.price >= 0);

  const pickupLocations = getCappedTagValues(
    tags,
    "pickup_location",
    TAG_CAPS.pickup_location
  );
  const categories = getCappedTagValues(tags, "t", TAG_CAPS.t);

  const publishedAt = getTagValue(tags, "published_at");
  const expiration = parseNumber(getTagValue(tags, "valid_until"));
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
    images,
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
    ...(getTagValue(tags, "required_customer_info") && {
      requiredCustomerInfo: getTagValue(tags, "required_customer_info"),
    }),
    ...(getTagValue(tags, "required") && {
      required: getTagValue(tags, "required"),
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

export function parseReviewEvent(event: NostrEvent): ReviewResponse {
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
  };
}
