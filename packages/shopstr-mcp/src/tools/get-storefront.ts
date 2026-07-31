import { z } from "zod";

import { createSuccessResponse, type ToolTextResponse } from "../errors.js";
import { storefrontInputSchema } from "../validation.js";
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
  guardSellerNotFound,
} from "./utils/seller.js";

export const getStorefrontInputSchema = {
  pubkey: z.string().describe("Seller public key as hex or npub"),
};

export async function handleGetStorefront(
  args: Record<string, unknown>,
  context: CoreToolContext
): Promise<ToolTextResponse> {
  const parsed = storefrontInputSchema.safeParse(args);
  if (!parsed.success) return createValidationErrorResponse(parsed.error);

  const pubkey = parsed.data.pubkey;
  const startedAt = Date.now();
  const [profiles, products] = await Promise.all([
    fetchSellerProfiles(pubkey, context),
    fetchSellerProducts(pubkey, context),
  ]);
  const relayMeta = combineRelayMetas(
    [profiles.meta, products.meta],
    Date.now() - startedAt
  );

  const guardError = guardSellerNotFound(
    relayMeta,
    profiles,
    products,
    undefined,
    "Use list_companies to discover sellers that have public storefront metadata."
  );
  if (guardError) return guardError;

  const storefront =
    profiles.shopProfile?.storefront &&
    typeof profiles.shopProfile.storefront === "object" &&
    !Array.isArray(profiles.shopProfile.storefront)
      ? profiles.shopProfile.storefront
      : {};
  const resultCount =
    Number(Boolean(profiles.userProfile)) +
    Number(Boolean(profiles.shopProfile)) +
    products.returnedProducts.length;
  const meta = {
    ...buildToolMeta(relayMeta, {
      resultCount,
      totalMatches: products.products.length,
      truncated: products.truncated,
      dataFreshness: getDataFreshness([
        ...[profiles.userProfile, profiles.shopProfile].filter(
          (profile): profile is NonNullable<typeof profile> => profile !== null
        ),
        ...products.returnedProducts,
      ]),
      hints: products.truncated
        ? [
            "Storefront has more products than returned; use get_company_details or search_products to inspect more.",
          ]
        : [],
    }),
    cached: profiles.cache,
  };

  return createSuccessResponse(
    {
      pubkey,
      shopProfile: profiles.shopProfile,
      userProfile: profiles.userProfile,
      storefront: {
        ...storefront,
        storefrontUrl: profiles.shopProfile?.storefrontUrl ?? null,
        customDomain: null,
      },
      products: {
        count: products.returnedProducts.length,
        totalMatches: products.products.length,
        items: products.returnedProducts,
      },
      paymentInfo: buildPaymentInfo(products.products),
    },
    meta,
    resultCount
  );
}
