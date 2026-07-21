import type { NextApiRequest, NextApiResponse } from "next";
import { getSatoshiValue } from "@getalby/lightning-tools";
import { Mint as CashuMint, Wallet as CashuWallet } from "@cashu/cashu-ts";
import { validateDiscountCode } from "@/utils/db/db-service";
import { withMintRetry } from "@/utils/cashu/mint-retry-service";
import { toCashuMintAmountSats } from "@/utils/cashu/payment-amount";
import {
  computeListingPricing,
  parseSelectedBulkOption,
  PricingValidationError,
} from "@/utils/payments/listing-pricing";
import type { ListingOrderFormType } from "@/utils/payments/listing-pricing";
import {
  resolveLatestListing,
  respondWithQuoteRouteError,
} from "@/utils/payments/listing-resolution";
import { applyRateLimit } from "@/utils/rate-limit";
import { getTrustedMintUrl } from "@/utils/cashu/trusted-mints";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

type MintQuoteRequest = {
  productId?: string;
  formType?: ListingOrderFormType;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number | string;
  discountCode?: string;
  priceOnly?: boolean;
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "listing-mint-quote", RATE_LIMIT)) {
    return;
  }

  const {
    productId,
    formType = null,
    selectedSize,
    selectedVolume,
    selectedWeight,
    selectedBulkOption,
    discountCode,
    priceOnly = false,
  } = req.body as MintQuoteRequest;

  if (!productId) {
    return res.status(400).json({ error: "productId is required" });
  }

  try {
    const product = await resolveLatestListing(productId);

    let discountPercentage = 0;
    if (discountCode?.trim()) {
      const discountResult = await validateDiscountCode(
        discountCode,
        product.pubkey,
        { rethrow: true }
      );

      if (!discountResult.valid || !discountResult.discount_percentage) {
        throw new PricingValidationError("Invalid discount code");
      }

      discountPercentage = discountResult.discount_percentage;
    }

    const pricing = computeListingPricing(product, {
      formType,
      selectedSize,
      selectedVolume,
      selectedWeight,
      selectedBulkOption: parseSelectedBulkOption(selectedBulkOption),
      discountPercentage,
    });
    const amount = await convertListingTotalToSats(
      pricing.total,
      pricing.currency
    );
    const mint = getTrustedMintUrl();

    if (priceOnly) {
      return res.status(200).json({
        amount,
        mintUrl: mint,
        pricing,
      });
    }

    const wallet = new CashuWallet(new CashuMint(mint));
    await wallet.loadMint();

    const mintQuote = await withMintRetry(
      () => wallet.createMintQuoteBolt11(amount),
      { maxAttempts: 4, perAttemptTimeoutMs: 15000, totalTimeoutMs: 60000 }
    );

    return res.status(200).json({
      request: mintQuote.request,
      quote: mintQuote.quote,
      amount,
      mintUrl: mint,
      pricing,
    });
  } catch (error) {
    return respondWithQuoteRouteError(res, error);
  }
}
