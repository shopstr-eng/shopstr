import { z } from "zod";

import { createSuccessResponse, type ToolTextResponse } from "../errors.js";
import { companyDetailsInputSchema } from "../validation.js";
import {
  buildToolMeta,
  combineRelayMetas,
  createValidationErrorResponse,
  getDataFreshness,
} from "./utils/common.js";
import type { CoreToolContext } from "./utils/context.js";
import {
  buildPaymentInfo,
  fetchSellerProducts,
  fetchSellerProfiles,
  fetchSellerReviews,
  guardSellerNotFound,
} from "./utils/seller.js";

export const getCompanyDetailsInputSchema = {
  pubkey: z.string().describe("Seller public key as hex or npub"),
};

export async function handleGetCompanyDetails(
  args: Record<string, unknown>,
  context: CoreToolContext
): Promise<ToolTextResponse> {
  const parsed = companyDetailsInputSchema.safeParse(args);
  if (!parsed.success) return createValidationErrorResponse(parsed.error);

  const startedAt = Date.now();
  const { pubkey } = parsed.data;
  const [profiles, products] = await Promise.all([
    fetchSellerProfiles(pubkey, context),
    fetchSellerProducts(pubkey, context),
  ]);
  const reviews = await fetchSellerReviews(pubkey, products.events, context);
  const relayMeta = combineRelayMetas(
    [profiles.meta, products.meta, reviews.meta],
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

  const truncated = products.truncated || reviews.truncated;
  const hints: string[] = [];
  if (products.truncated) {
    hints.push(
      "Seller has more products than returned; use search_products with the seller's categories or product keywords to narrow further."
    );
  }
  if (reviews.truncated) {
    hints.push(
      "Seller has more reviews than returned; use get_reviews with sellerPubkey for review-only inspection."
    );
  }
  const resultCount =
    Number(Boolean(profiles.userProfile)) +
    Number(Boolean(profiles.shopProfile)) +
    products.returnedProducts.length +
    reviews.returnedReviews.length;

  const dataFreshness = getDataFreshness([
    ...[profiles.userProfile, profiles.shopProfile].filter(
      (profile): profile is NonNullable<typeof profile> => profile !== null
    ),
    ...products.returnedProducts,
    ...reviews.returnedReviews,
  ]);
  const meta = {
    ...buildToolMeta(relayMeta, {
      resultCount,
      totalMatches: products.products.length + reviews.reviews.length,
      truncated,
      dataFreshness,
      hints,
    }),
    cached: profiles.cache,
  };

  return createSuccessResponse(
    {
      pubkey,
      shopProfile: profiles.shopProfile,
      userProfile: profiles.userProfile,
      products: {
        count: products.returnedProducts.length,
        totalMatches: products.products.length,
        items: products.returnedProducts,
      },
      reviews: {
        count: reviews.returnedReviews.length,
        totalMatches: reviews.reviews.length,
        items: reviews.returnedReviews,
      },
      paymentInfo: buildPaymentInfo(products.products),
    },
    meta,
    resultCount
  );
}
