import type { NextApiResponse } from "next";
import {
  DatabaseUnavailableError,
  fetchProductByDTagAndPubkey,
  fetchProductByIdFromDb,
} from "@/utils/db/db-service";
import {
  parseTags,
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import { MintOperationError } from "@/utils/cashu/mint-retry-service";
import { PricingValidationError } from "@/utils/payments/listing-pricing";

/** The requested listing does not exist in the event cache. Maps to 404. */
export class ListingNotFoundError extends Error {
  constructor(message = "Product not found") {
    super(message);
    this.name = "ListingNotFoundError";
  }
}

/**
 * Resolves a listing by event id, then re-resolves to the latest version of
 * that listing via its d-tag so stale client-side events can never lock in an
 * outdated price. DB infrastructure failures throw DatabaseUnavailableError
 * (they are NOT silently treated as "not found").
 */
export async function resolveLatestListing(
  productId: string
): Promise<ProductData> {
  let productEvent = await fetchProductByIdFromDb(productId, {
    rethrow: true,
  });

  if (!productEvent) {
    throw new ListingNotFoundError();
  }

  const requestedProduct = parseTags(productEvent);
  if (!requestedProduct) {
    throw new Error(`Failed to parse product event ${productId}`);
  }

  if (requestedProduct.d) {
    productEvent =
      (await fetchProductByDTagAndPubkey(
        requestedProduct.d,
        requestedProduct.pubkey,
        { rethrow: true }
      )) ?? productEvent;
  }

  const product = parseTags(productEvent);
  if (!product) {
    throw new Error(`Failed to parse latest product event for ${productId}`);
  }

  return product;
}

/**
 * Maps errors thrown by the mint-quote routes to safe HTTP responses:
 * - PricingValidationError -> 400 with its (safe, user-facing) message
 * - ListingNotFoundError   -> 404
 * - DatabaseUnavailableError -> 503
 * - MintOperationError     -> 502
 * - anything else          -> 500 with a generic message (never leaks
 *   internal error details to the client)
 */
export function respondWithQuoteRouteError(
  res: NextApiResponse,
  error: unknown
) {
  if (error instanceof PricingValidationError) {
    return res.status(400).json({ error: error.message });
  }

  if (error instanceof ListingNotFoundError) {
    return res.status(404).json({ error: "Product not found" });
  }

  if (error instanceof DatabaseUnavailableError) {
    return res.status(503).json({
      error: "Service temporarily unavailable. Please try again.",
    });
  }

  if (error instanceof MintOperationError) {
    return res.status(502).json({
      error: "The payment mint is unavailable. Please try again.",
    });
  }

  console.error("Mint quote route failed:", error);
  return res.status(500).json({ error: "Failed to create invoice" });
}
