import type { NextApiRequest, NextApiResponse } from "next";
import { Mint as CashuMint, Wallet as CashuWallet } from "@cashu/cashu-ts";
import { withMintRetry } from "@/utils/cashu/mint-retry-service";
import {
  computeCartPricing,
  CartPricingRequest,
} from "@/utils/payments/cart-pricing";
import { respondWithQuoteRouteError } from "@/utils/payments/listing-resolution";
import { applyRateLimit } from "@/utils/rate-limit";
import { getTrustedMintUrl } from "@/utils/cashu/trusted-mints";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

type CartMintQuoteRequest = CartPricingRequest & {
  priceOnly?: boolean;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "cart-mint-quote", RATE_LIMIT)) {
    return;
  }

  const {
    items,
    formType,
    shippingPickupPreference,
    discountCodes,
    priceOnly = false,
  } = req.body as CartMintQuoteRequest;

  try {
    const pricing = await computeCartPricing({
      items,
      formType,
      shippingPickupPreference,
      discountCodes,
    });
    const mint = getTrustedMintUrl();

    if (priceOnly) {
      return res.status(200).json({
        amount: pricing.amount,
        mintUrl: mint,
        breakdown: pricing.breakdown,
        appliedDiscounts: pricing.appliedDiscounts,
      });
    }

    const wallet = new CashuWallet(new CashuMint(mint));
    await wallet.loadMint();

    const mintQuote = await withMintRetry(
      () => wallet.createMintQuoteBolt11(pricing.amount),
      { maxAttempts: 4, perAttemptTimeoutMs: 15000, totalTimeoutMs: 60000 }
    );

    return res.status(200).json({
      request: mintQuote.request,
      quote: mintQuote.quote,
      amount: pricing.amount,
      mintUrl: mint,
      breakdown: pricing.breakdown,
      appliedDiscounts: pricing.appliedDiscounts,
    });
  } catch (error) {
    return respondWithQuoteRouteError(res, error);
  }
}
