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
import { verifyNip05Claim, type Nip05Verification } from "../../nip05.js";
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
  REVIEW_PRODUCT_FILTER_LIMIT,
  REVIEW_RESPONSE_BUDGET,
  SHOP_PROFILE_KIND,
  CACHE_KINDS,
  allRelaysFailed,
  buildToolMeta,
  createRelayUnavailableResponse,
  emptyRelayMeta,
  observeProductEventsForCategories,
} from "./common.js";
import type { CoreToolContext } from "./context.js";
import {
  confidenceField,
  createReviewFilter,
  eventReferencesSeller,
  hasProductAddress,
  hasTag,
  reviewMatchConfidence,
} from "./review-helpers.js";

export type SellerProfilesResult = {
  userProfile: ProfileResponse | null;
  shopProfile: ProfileResponse | null;
  nip05Verification: {
    userProfile: Nip05Verification | null;
    shopProfile: Nip05Verification | null;
  };
  meta: RelayFetchMeta;
  cache: {
    userProfile: boolean;
    shopProfile: boolean;
    userNip05Verification: boolean;
    shopNip05Verification: boolean;
  };
};

export type SellerProductsResult = {
  events: NostrEvent[];
  products: ProductResponse[];
  returnedProducts: ProductResponse[];
  truncated: boolean;
  meta: RelayFetchMeta;
  cache: {
    products: boolean;
  };
};

export type SellerReviewsResult = {
  events: NostrEvent[];
  reviews: ReviewResponse[];
  returnedReviews: ReviewResponse[];
  truncated: boolean;
  reviewLookupPartial: boolean;
  meta: RelayFetchMeta;
  cache: {
    reviews: boolean;
  };
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
    const nip05Verification = await verifySellerProfilesNip05(
      pubkey,
      userProfile,
      shopProfile,
      context
    );

    return {
      userProfile,
      shopProfile,
      nip05Verification: nip05Verification.results,
      meta: emptyRelayMeta(),
      cache: {
        userProfile: true,
        shopProfile: true,
        ...nip05Verification.cache,
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

  const nip05Verification = await verifySellerProfilesNip05(
    pubkey,
    userProfile,
    shopProfile,
    context
  );

  return {
    userProfile,
    shopProfile,
    nip05Verification: nip05Verification.results,
    meta: relayResult.meta,
    cache: {
      userProfile: cachedUserProfile?.cached ?? false,
      shopProfile: cachedShopProfile?.cached ?? false,
      ...nip05Verification.cache,
    },
  };
}

async function verifySellerProfilesNip05(
  pubkey: string,
  userProfile: ProfileResponse | null,
  shopProfile: ProfileResponse | null,
  context: CoreToolContext
): Promise<{
  results: SellerProfilesResult["nip05Verification"];
  cache: Pick<
    SellerProfilesResult["cache"],
    "userNip05Verification" | "shopNip05Verification"
  >;
}> {
  const [userResult, shopResult] = await Promise.all([
    verifyProfileNip05(pubkey, userProfile, context),
    verifyProfileNip05(pubkey, shopProfile, context),
  ]);

  return {
    results: {
      userProfile: userResult.verification,
      shopProfile: shopResult.verification,
    },
    cache: {
      userNip05Verification: userResult.cached,
      shopNip05Verification: shopResult.cached,
    },
  };
}

async function verifyProfileNip05(
  pubkey: string,
  profile: ProfileResponse | null,
  context: CoreToolContext
): Promise<{ verification: Nip05Verification | null; cached: boolean }> {
  const claimed = profile?.nip05?.trim();
  if (!claimed) return { verification: null, cached: false };

  const cacheKey = {
    pubkey: `${pubkey}:${claimed.toLowerCase()}`,
    kind: CACHE_KINDS.NIP05_VERIFICATION,
  };
  const cache = context.nip05Cache ?? context.cache;
  const cached = cache.get<Nip05Verification>(cacheKey);
  if (cached) {
    return { verification: cached.value, cached: cached.cached };
  }

  const verifier = context.nip05Verifier ?? verifyNip05Claim;
  const verification = await verifier(claimed, pubkey, {
    timeoutMs: context.timeoutMs,
  });
  cache.set(cacheKey, verification);

  return { verification, cached: false };
}

export async function fetchSellerProducts(
  pubkey: string,
  context: CoreToolContext
): Promise<SellerProductsResult> {
  const cached = context.cache.get<NostrEvent[]>({
    pubkey,
    kind: CACHE_KINDS.SELLER_PRODUCTS,
  });

  let events = cached?.value;
  let meta = emptyRelayMeta();

  if (!events) {
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
    events = relayResult.events;
    meta = relayResult.meta;
    if (!allRelaysFailed(meta)) {
      context.cache.set({ pubkey, kind: CACHE_KINDS.SELLER_PRODUCTS }, events);
      observeProductEventsForCategories(events);
    }
  }

  const productEvents = mergeAndDeduplicateProducts(events);
  const publicProducts = productEvents
    .map((event) => ({ event, product: parseProductEvent(event) }))
    .filter(({ product }) => isPublicProduct(product));
  const products = publicProducts.map(({ product }) => product);
  const publicProductEvents = publicProducts.map(({ event }) => event);
  const returnedProducts = products.slice(0, PRODUCT_RESPONSE_BUDGET);

  return {
    events: publicProductEvents,
    products,
    returnedProducts,
    truncated: returnedProducts.length < products.length,
    meta,
    cache: {
      products: cached?.cached ?? false,
    },
  };
}

export async function fetchSellerReviews(
  sellerPubkey: string,
  productEvents: readonly NostrEvent[],
  context: CoreToolContext
): Promise<SellerReviewsResult> {
  const cached = context.cache.get<NostrEvent[]>({
    pubkey: sellerPubkey,
    kind: CACHE_KINDS.SELLER_REVIEWS,
  });
  const allProductAddresses = Array.from(
    new Set(
      productEvents
        .map(getParameterizedReplaceableCoordinate)
        .filter((value): value is string => value !== undefined)
    )
  );
  const productAddresses = allProductAddresses.slice(
    0,
    REVIEW_PRODUCT_FILTER_LIMIT
  );
  let events = cached?.value;
  let meta = emptyRelayMeta();

  if (!events) {
    const relayFilters = buildSellerReviewFilters(
      productAddresses,
      sellerPubkey
    );
    const relayResult = await fetchFromRelays(
      context.nostr,
      context.relays,
      relayFilters,
      { timeoutMs: context.timeoutMs }
    );
    events = relayResult.events;
    meta = relayResult.meta;
    if (!allRelaysFailed(meta)) {
      context.cache.set(
        { pubkey: sellerPubkey, kind: CACHE_KINDS.SELLER_REVIEWS },
        events
      );
    }
  }

  const reviewEvents = mergeAndDeduplicateReviews(events).filter((event) =>
    reviewMatchesSeller(event, sellerPubkey, allProductAddresses)
  );
  const reviews = reviewEvents.map((event) =>
    parseReviewEvent(
      event,
      confidenceField(reviewMatchConfidence(event, allProductAddresses))
    )
  );
  const returnedReviews = reviews.slice(0, REVIEW_RESPONSE_BUDGET);

  const reviewLookupPartial =
    allProductAddresses.length > REVIEW_PRODUCT_FILTER_LIMIT;

  return {
    events: reviewEvents,
    reviews,
    returnedReviews,
    truncated: returnedReviews.length < reviews.length,
    reviewLookupPartial,
    meta,
    cache: {
      reviews: cached?.cached ?? false,
    },
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
  const productReferences = getSellerProductAddressReferences(
    event,
    sellerPubkey
  );
  if (productReferences.length > 0) {
    return productReferences.some((address) =>
      productAddresses.includes(address)
    );
  }
  if (hasTag(event, "p", sellerPubkey)) return true;
  if (eventReferencesSeller(event, sellerPubkey)) return true;
  return productAddresses.some((address) => hasProductAddress(event, address));
}

function getSellerProductAddressReferences(
  event: NostrEvent,
  sellerPubkey: string
): string[] {
  const prefix = `${PRODUCT_KIND}:${sellerPubkey}:`;
  return event.tags.flatMap((tag) => {
    const [key, value] = tag;
    if ((key !== "d" && key !== "a") || typeof value !== "string") {
      return [];
    }
    const coordinate = value.startsWith("a:") ? value.slice(2) : value;
    return coordinate.startsWith(prefix) ? [coordinate] : [];
  });
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
