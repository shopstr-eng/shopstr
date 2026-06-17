import {
  getParameterizedReplaceableCoordinate,
  mergeAndDeduplicateProducts,
  mergeAndDeduplicateProfiles,
  mergeAndDeduplicateReviews,
} from "../../dedup.js";
import {
  parseProductEvent,
  parseProfileEvent,
  parseReviewEvent,
} from "../../parse-tags.js";
import { fetchFromRelays } from "../../relay-fetch.js";
import type {
  NostrEvent,
  NostrFilter,
  ProductResponse,
  ProfileResponse,
  RelayFetchMeta,
  ReviewResponse,
} from "../../types.js";
import {
  MCP_ERROR_CODES,
  createErrorResponse,
  type ToolTextResponse,
} from "../../errors.js";
import {
  PRODUCT_KIND,
  PRODUCT_RESPONSE_BUDGET,
  PROFILE_KIND,
  REVIEW_RESPONSE_BUDGET,
  SHOP_PROFILE_KIND,
  allRelaysFailed,
  buildToolMeta,
  createRelayUnavailableResponse,
  emptyRelayMeta,
} from "./common.js";
import type { CoreToolContext } from "./context.js";
import {
  createReviewFilter,
  eventReferencesSeller,
  hasProductAddress,
  hasTag,
} from "./review-helpers.js";

export type SellerProfilesResult = {
  userProfile: ProfileResponse | null;
  shopProfile: ProfileResponse | null;
  meta: RelayFetchMeta;
  cache: {
    userProfile: boolean;
    shopProfile: boolean;
  };
};

export type SellerProductsResult = {
  events: NostrEvent[];
  products: ProductResponse[];
  returnedProducts: ProductResponse[];
  truncated: boolean;
  meta: RelayFetchMeta;
};

export type SellerReviewsResult = {
  reviews: ReviewResponse[];
  returnedReviews: ReviewResponse[];
  truncated: boolean;
  meta: RelayFetchMeta;
};

export function isPublicProduct(product: ProductResponse): boolean {
  return product.visibility !== "hidden";
}

export async function fetchSellerProfiles(
  pubkey: string,
  context: CoreToolContext
): Promise<SellerProfilesResult> {
  const cachedUserProfile = context.cache.get<ProfileResponse>({
    pubkey,
    kind: PROFILE_KIND,
  });
  const cachedShopProfile = context.cache.get<ProfileResponse>({
    pubkey,
    kind: SHOP_PROFILE_KIND,
  });

  let userProfile = cachedUserProfile?.value ?? null;
  let shopProfile = cachedShopProfile?.value ?? null;
  const missingKinds: number[] = [];
  if (!userProfile) missingKinds.push(PROFILE_KIND);
  if (!shopProfile) missingKinds.push(SHOP_PROFILE_KIND);

  if (missingKinds.length === 0) {
    return {
      userProfile,
      shopProfile,
      meta: emptyRelayMeta(),
      cache: {
        userProfile: true,
        shopProfile: true,
      },
    };
  }

  const relayResult = await fetchFromRelays(
    context.nostr,
    context.relays,
    [
      {
        kinds: missingKinds,
        authors: [pubkey],
        limit: 10,
      },
    ],
    { timeoutMs: context.timeoutMs }
  );

  const profiles = mergeAndDeduplicateProfiles(relayResult.events).map(
    parseProfileEvent
  );

  for (const profile of profiles) {
    if (profile.kind === PROFILE_KIND) {
      userProfile = profile;
      context.cache.set({ pubkey, kind: PROFILE_KIND }, profile);
    }
    if (profile.kind === SHOP_PROFILE_KIND) {
      shopProfile = profile;
      context.cache.set({ pubkey, kind: SHOP_PROFILE_KIND }, profile);
    }
  }

  return {
    userProfile,
    shopProfile,
    meta: relayResult.meta,
    cache: {
      userProfile: cachedUserProfile?.cached ?? false,
      shopProfile: cachedShopProfile?.cached ?? false,
    },
  };
}

export async function fetchSellerProducts(
  pubkey: string,
  context: CoreToolContext
): Promise<SellerProductsResult> {
  const relayResult = await fetchFromRelays(
    context.nostr,
    context.relays,
    [
      {
        kinds: [PRODUCT_KIND],
        authors: [pubkey],
        limit: 500,
      },
    ],
    { timeoutMs: context.timeoutMs }
  );

  const events = mergeAndDeduplicateProducts(relayResult.events);
  const products = events.map(parseProductEvent).filter(isPublicProduct);
  const returnedProducts = products.slice(0, PRODUCT_RESPONSE_BUDGET);

  return {
    events,
    products,
    returnedProducts,
    truncated: returnedProducts.length < products.length,
    meta: relayResult.meta,
  };
}

export async function fetchSellerReviews(
  sellerPubkey: string,
  productEvents: readonly NostrEvent[],
  context: CoreToolContext
): Promise<SellerReviewsResult> {
  const productAddresses = Array.from(
    new Set(
      productEvents
        .map(getParameterizedReplaceableCoordinate)
        .filter((value): value is string => value !== undefined)
    )
  );
  const relayFilters = buildSellerReviewFilters(productAddresses, sellerPubkey);
  const relayResult = await fetchFromRelays(
    context.nostr,
    context.relays,
    relayFilters,
    { timeoutMs: context.timeoutMs }
  );

  const reviews = mergeAndDeduplicateReviews(relayResult.events)
    .filter((event) =>
      reviewMatchesSeller(event, sellerPubkey, productAddresses)
    )
    .map(parseReviewEvent);
  const returnedReviews = reviews.slice(0, REVIEW_RESPONSE_BUDGET);

  return {
    reviews,
    returnedReviews,
    truncated: returnedReviews.length < reviews.length,
    meta: relayResult.meta,
  };
}

export function buildPaymentInfo(products: readonly ProductResponse[]): {
  acceptedPaymentMethods: string[];
  hasStripeConnect: boolean;
  freeShippingAvailable: boolean;
  freeShippingProductCount: number;
  priceRanges: Array<{
    currency: string;
    min: number;
    max: number;
    count: number;
  }>;
  priceRange: { min: number; max: number; currency: string } | null;
} {
  const priceBuckets = new Map<string, number[]>();
  for (const product of products) {
    if (product.priceStatus !== "known" || product.price === undefined) {
      continue;
    }
    const currency = product.currency ?? "sats";
    const bucket = priceBuckets.get(currency) ?? [];
    bucket.push(product.price);
    priceBuckets.set(currency, bucket);
  }

  const priceRanges = Array.from(priceBuckets.entries()).map(
    ([currency, prices]) => ({
      currency,
      min: Math.min(...prices),
      max: Math.max(...prices),
      count: prices.length,
    })
  );
  const freeShippingProductCount = products.filter(
    (product) =>
      product.shippingType === "Free" || product.shippingType === "Free/Pickup"
  ).length;

  return {
    acceptedPaymentMethods: ["lightning", "cashu"],
    hasStripeConnect: false,
    freeShippingAvailable: freeShippingProductCount > 0,
    freeShippingProductCount,
    priceRanges,
    priceRange:
      priceRanges.length === 1
        ? {
            min: priceRanges[0]!.min,
            max: priceRanges[0]!.max,
            currency: priceRanges[0]!.currency,
          }
        : null,
  };
}

function buildSellerReviewFilters(
  productAddresses: readonly string[],
  sellerPubkey: string
): NostrFilter[] {
  const filters: NostrFilter[] = [];

  for (const productAddress of productAddresses) {
    filters.push(
      createReviewFilter({ "#d": [`a:${productAddress}`, productAddress] }),
      createReviewFilter({ "#a": [productAddress] })
    );
  }

  filters.push(createReviewFilter({ "#p": [sellerPubkey] }));
  return filters;
}

function reviewMatchesSeller(
  event: NostrEvent,
  sellerPubkey: string,
  productAddresses: readonly string[]
): boolean {
  if (hasTag(event, "p", sellerPubkey)) return true;
  if (eventReferencesSeller(event, sellerPubkey)) return true;
  return productAddresses.some((address) => hasProductAddress(event, address));
}

/**
  Shared guard: returns an error response if the seller has no data at all,
  either because all relays failed or because the pubkey doesn't exist.
**/
export function guardSellerNotFound(
  relayMeta: RelayFetchMeta,
  profiles: SellerProfilesResult,
  products: SellerProductsResult,
  reviews?: SellerReviewsResult,
  discoveryHint = "Use list_companies to discover seller pubkeys."
): ToolTextResponse | undefined {
  const hasAnyData =
    Boolean(profiles.userProfile) ||
    Boolean(profiles.shopProfile) ||
    products.products.length > 0 ||
    (reviews?.reviews.length ?? 0) > 0;

  if (allRelaysFailed(relayMeta) && !hasAnyData) {
    return createRelayUnavailableResponse(relayMeta);
  }

  if (
    !profiles.userProfile &&
    !profiles.shopProfile &&
    products.products.length === 0 &&
    (reviews?.reviews.length ?? 0) === 0
  ) {
    return createErrorResponse(
      "Seller not found.",
      MCP_ERROR_CODES.NOT_FOUND,
      false,
      undefined,
      buildToolMeta(relayMeta, {
        hints: [discoveryHint],
      })
    );
  }

  return undefined;
}
