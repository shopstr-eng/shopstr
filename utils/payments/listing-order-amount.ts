import { getSatoshiValue } from "@getalby/lightning-tools";
import { validateDiscountCode } from "@/utils/db/db-service";
import { toCashuMintAmountSats } from "@/utils/cashu/payment-amount";
import {
  computeListingPricing,
  parseSelectedBulkOption,
  PricingValidationError,
  type ListingOrderFormType,
  type ListingPricingResult,
} from "@/utils/payments/listing-pricing";
import { resolveLatestListing } from "@/utils/payments/listing-resolution";
import type { ProductData } from "@/utils/parsers/product-parser-functions";

/**
 * The single server-side source of truth for "what does this listing order
 * cost, in sats". Both the checkout mint-quote route and the hold-invoice
 * escrow registration route resolve the amount through here, so a buyer can
 * never register an escrow for an amount the checkout flow would not have
 * quoted.
 *
 * The listing itself is always re-resolved to its latest event (by d-tag), so
 * a stale client-side copy cannot pin an old price. Every price-affecting
 * input is validated by {@link computeListingPricing}; the discount code is
 * re-checked against the seller here.
 */

export type ListingOrderPricingInputs = {
  formType?: ListingOrderFormType;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number | string;
  discountCode?: string;
};

export type ResolvedListingOrderAmount = {
  /** The latest listing event, already parsed and validated as purchasable. */
  product: ProductData;
  pricing: ListingPricingResult;
  /**
   * Authoritative amount in sats — the exact value
   * `/api/listing/mint-quote` would return for the same inputs.
   */
  amountSats: number;
};

async function convertListingTotalToSats(total: number, currency: string) {
  const normalizedCurrency = currency.toLowerCase();
  if (normalizedCurrency === "sats" || normalizedCurrency === "sat") {
    return toCashuMintAmountSats(total);
  }

  const sats = await getSatoshiValue({
    amount: total,
    currency,
  });

  return toCashuMintAmountSats(sats);
}

export async function resolveListingOrderAmount(
  productId: string,
  inputs: ListingOrderPricingInputs
): Promise<ResolvedListingOrderAmount> {
  const product = await resolveLatestListing(productId);

  let discountPercentage = 0;
  if (inputs.discountCode?.trim()) {
    const discountResult = await validateDiscountCode(
      inputs.discountCode,
      product.pubkey,
      { rethrow: true }
    );

    if (!discountResult.valid || !discountResult.discount_percentage) {
      throw new PricingValidationError("Invalid discount code");
    }

    discountPercentage = discountResult.discount_percentage;
  }

  const pricing = computeListingPricing(product, {
    formType: inputs.formType,
    selectedSize: inputs.selectedSize,
    selectedVolume: inputs.selectedVolume,
    selectedWeight: inputs.selectedWeight,
    selectedBulkOption: parseSelectedBulkOption(inputs.selectedBulkOption),
    discountPercentage,
  });

  const amountSats = await convertListingTotalToSats(
    pricing.total,
    pricing.currency
  );

  return { product, pricing, amountSats };
}

function isSatsDenominated(currency: string): boolean {
  const normalized = currency.toLowerCase();
  return normalized === "sats" || normalized === "sat";
}

/**
 * Rejects a client-declared sats amount that does not match the server's
 * authoritative amount for a listing order. Throws
 * {@link PricingValidationError} on mismatch — routes map that to a 400 with
 * its (safe) message and never leak internals.
 *
 * - Sats-denominated listings: exact equality. The whole computation is
 *   deterministic, so any difference at all is tampering.
 * - Fiat-denominated listings: the listing total in its own currency is
 *   already enforced exactly by {@link resolveListingOrderAmount}; only the
 *   currency->sats conversion moves with the exchange rate between the
 *   client's price quote and this call. That one leg is allowed
 *   `max(2 sats, 1%)` of drift in either direction — the same tolerance the
 *   checkout client applies before it spends — and anything past the band is
 *   rejected.
 */
export function assertClientAmountMatchesAuthoritative(args: {
  requestedAmountSats: number;
  authoritativeAmountSats: number;
  currency: string;
}): void {
  const { requestedAmountSats, authoritativeAmountSats, currency } = args;

  if (isSatsDenominated(currency)) {
    if (requestedAmountSats !== authoritativeAmountSats) {
      throw new PricingValidationError(
        "Amount does not match the current listing price"
      );
    }
    return;
  }

  const tolerance = Math.max(2, Math.ceil(authoritativeAmountSats * 0.01));
  if (Math.abs(requestedAmountSats - authoritativeAmountSats) > tolerance) {
    throw new PricingValidationError(
      "Amount does not match the current listing price"
    );
  }
}
