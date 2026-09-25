import type { NextApiRequest, NextApiResponse } from "next";
import { Mint as CashuMint, Wallet as CashuWallet } from "@cashu/cashu-ts";
import { withMintRetry } from "@/utils/cashu/mint-retry-service";
import type { ListingOrderFormType } from "@/utils/payments/listing-pricing";
import { resolveListingOrderAmount } from "@/utils/payments/listing-order-amount";
import { respondWithQuoteRouteError } from "@/utils/payments/listing-resolution";
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
    const { pricing, amountSats: amount } = await resolveListingOrderAmount(
      productId,
      {
        formType: formType ?? undefined,
        selectedSize,
        selectedVolume,
        selectedWeight,
        selectedBulkOption,
        discountCode,
      }
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
