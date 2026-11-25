import { z } from "zod";

import { createSuccessResponse, type ToolTextResponse } from "../errors.js";
import { companyDetailsInputSchema } from "../validation.js";
import {
  buildToolMeta,
  combineRelayMetas,
  createValidationErrorResponse,
  emptyRelayMeta,
  getDataFreshness,
} from "./utils/common.js";
import type { CoreToolContext } from "./utils/context.js";
import {
  buildPaymentInfo,
  fetchSellerProducts,
  fetchSellerProfiles,
  fetchSellerReviews,
  guardSellerNotFound,
  type SellerProductsResult,
  type SellerReviewsResult,
} from "./utils/seller.js";

export const getCompanyDetailsInputSchema = {
  sellerPubkey: z.string().describe("Seller public key as hex or npub"),
  include: z
    .array(z.enum(["products", "reviews"]))
    .optional()
    .describe(
      "Optional sections to include. Profile, shop metadata, and storefront are always returned; products and reviews default to included when omitted."
    ),
};

export async function handleGetCompanyDetails(
  args: Record<string, unknown>,
  context: CoreToolContext
): Promise<ToolTextResponse> {
  const parsed = companyDetailsInputSchema.safeParse(args);
  if (!parsed.success) return createValidationErrorResponse(parsed.error);

  const startedAt = Date.now();
  const { sellerPubkey, include } = parsed.data;
  const includeProducts = include.includes("products");
  const includeReviews = include.includes("reviews");
  const [profiles, products] = await Promise.all([
    fetchSellerProfiles(sellerPubkey, context),
    includeProducts || includeReviews
      ? fetchSellerProducts(sellerPubkey, context)
      : Promise.resolve(emptyProductsResult()),
  ]);
  const reviews = includeReviews
    ? await fetchSellerReviews(sellerPubkey, products.events, context)
    : emptyReviewsResult();
  const relayMeta = combineRelayMetas(
    [
      profiles.meta,
      ...(includeProducts || includeReviews ? [products.meta] : []),
      ...(includeReviews ? [reviews.meta] : []),
    ],
    Date.now() - startedAt
  );

  const guardError = guardSellerNotFound(
    relayMeta,
    profiles,
    products,
    reviews,
    "Use list_companies to discover seller pubkeys before calling get_company_details."
  );
  if (guardError) return guardError;

  const storefront =
    profiles.shopProfile?.storefront &&
    typeof profiles.shopProfile.storefront === "object" &&
    !Array.isArray(profiles.shopProfile.storefront)
      ? profiles.shopProfile.storefront
      : {};
  const truncated =
    (includeProducts && products.truncated) ||
    (includeReviews && reviews.truncated);
  const hints: string[] = [];
  if (includeProducts && products.truncated) {
    hints.push(
      "Seller has more products than returned; use search_products with the seller's categories or product keywords to narrow further."
    );
  }
  if (includeReviews && reviews.truncated) {
    hints.push(
      "Seller has more reviews than returned; use get_reviews with sellerPubkey for review-only inspection."
    );
  }
  const resultCount =
    Number(Boolean(profiles.userProfile)) +
    Number(Boolean(profiles.shopProfile)) +
    (includeProducts ? products.returnedProducts.length : 0) +
    (includeReviews ? reviews.returnedReviews.length : 0);

  const dataFreshness = getDataFreshness([
    ...[profiles.userProfile, profiles.shopProfile].filter(
      (profile): profile is NonNullable<typeof profile> => profile !== null
    ),
    ...(includeProducts ? products.returnedProducts : []),
    ...(includeReviews ? reviews.returnedReviews : []),
  ]);
  const meta = {
    ...buildToolMeta(relayMeta, {
      resultCount,
      totalMatches:
        (includeProducts ? products.products.length : 0) +
        (includeReviews ? reviews.reviews.length : 0),
      truncated,
      dataFreshness,
      hints,
    }),
    cached: {
      ...profiles.cache,
      ...(includeProducts || includeReviews ? products.cache : {}),
      ...(includeReviews ? reviews.cache : {}),
    },
  };

  return createSuccessResponse(
    {
      sellerPubkey,
      shopProfile: profiles.shopProfile,
      userProfile: profiles.userProfile,
      nip05Verification: profiles.nip05Verification,
      storefront: {
        ...storefront,
        storefrontUrl: profiles.shopProfile?.storefrontUrl ?? null,
      },
      ...(includeProducts && {
        products: {
          count: products.returnedProducts.length,
          totalMatches: products.products.length,
          items: products.returnedProducts,
        },
      }),
      ...(includeReviews && {
        reviews: {
          count: reviews.returnedReviews.length,
          totalMatches: reviews.reviews.length,
          items: reviews.returnedReviews,
        },
        reviewCoverage: reviews.reviewLookupPartial ? "partial" : "complete",
      }),
      ...(includeProducts && {
        paymentInfo: buildPaymentInfo(products.products),
      }),
    },
    meta,
    resultCount
  );
}

function emptyProductsResult(): SellerProductsResult {
  return {
    events: [],
    products: [],
    returnedProducts: [],
    truncated: false,
    meta: emptyRelayMeta(),
    cache: {
      products: false,
    },
  };
}

function emptyReviewsResult(): SellerReviewsResult {
  return {
    events: [],
    reviews: [],
    returnedReviews: [],
    truncated: false,
    reviewLookupPartial: false,
    meta: emptyRelayMeta(),
    cache: {
      reviews: false,
    },
  };
}
