import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { getStripeConnectAccount } from "@/utils/db/db-service";
import { isCrypto, toSmallestUnit, satsToUSD } from "@/utils/stripe/currency";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});

interface SellerSplit {
  sellerPubkey: string;
  // Preferred: per-seller subtotal already in seller-currency smallest units
  // (cents for fiat, sats for sats, whole units for zero-decimal currencies).
  // The frontend ceils each line to smallest units and sums them in the
  // seller's native currency before sending. The API treats the sum of these
  // as the source of truth for the buyer charge — no further per-split
  // rounding can introduce a sum-of-splits-exceeds-total mismatch.
  amountSmallest?: number;
  // Legacy raw-amount field, kept for back-compat with any older callers.
  amount?: number;
  currency: string;
  // Optional affiliate attribution — when present, the seller's share will be
  // reduced by `affiliateRebateSmallest` and that amount will be transferred
  // to `affiliateAccountId` (Stripe Connect) by process-transfers. If no
  // account is connected we still record the rebate in metadata so it can
  // accrue to the affiliate's balance.
  affiliateRebateSmallest?: number;
  affiliateAccountId?: string | null;
  affiliateId?: number;
  affiliateCodeId?: number;
  affiliateCode?: string;
}
import { applyRateLimit } from "@/utils/rate-limit";
import {
  withStripeRetry,
  stableIdempotencyKey,
} from "@/utils/stripe/retry-service";
import {
  recordPendingPayment,
  updatePendingPayment,
} from "@/utils/stripe/pending-payments";
import { resolveDonationCut } from "@/utils/stripe/donation";

// Rate limit: per-IP cap to bound abuse of payment endpoints.
const RATE_LIMIT = { limit: 30, windowMs: 60000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "stripe-create-payment-intent", RATE_LIMIT))
    return;

  try {
    const {
      amount,
      currency,
      customerEmail,
      productTitle,
      productDescription,
      metadata,
      sellerSplits,
    } = req.body;

    let amountInSmallestUnit: number;
    let stripeCurrency: string;

    if (isCrypto(currency)) {
      let sats = currency.toLowerCase() === "btc" ? amount * 100000000 : amount;
      const usdAmount = await satsToUSD(sats);
      amountInSmallestUnit = Math.ceil(usdAmount * 100);
      stripeCurrency = "usd";
    } else {
      amountInSmallestUnit = toSmallestUnit(amount, currency);
      stripeCurrency = currency.toLowerCase();
    }

    const isMultiMerchant =
      sellerSplits && Array.isArray(sellerSplits) && sellerSplits.length > 1;

    let transferGroup = "";
    const splitDetails: {
      pubkey: string;
      amountCents: number;
      accountId: string;
      donationPercent: number;
      donationCutSmallest: number;
      affiliateRebateSmallest: number;
      affiliateAccountId: string | null;
      affiliateId: number | null;
      affiliateCodeId: number | null;
      affiliateCode: string | null;
    }[] = [];

    if (isMultiMerchant) {
      transferGroup = `cart_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}`;

      for (const split of sellerSplits as SellerSplit[]) {
        const isPlatformAccount =
          split.sellerPubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK;

        let accountId = "";
        if (!isPlatformAccount) {
          const connectAccount = await getStripeConnectAccount(
            split.sellerPubkey
          );
          if (!connectAccount || !connectAccount.charges_enabled) {
            return res.status(400).json({
              error: `Seller ${split.sellerPubkey.substring(
                0,
                8
              )}... does not have Stripe enabled`,
            });
          }
          accountId = connectAccount.stripe_account_id;
        }

        let splitAmountSmallest: number;
        if (isCrypto(split.currency)) {
          // Crypto splits must be FX-converted to USD cents (Stripe never
          // settles in sats/btc). The frontend has already aggregated the
          // seller's lines and ceiled to satoshi precision, so this is the
          // only remaining ceil — one per seller.
          const sellerSats =
            typeof split.amountSmallest === "number"
              ? split.currency.toLowerCase() === "btc"
                ? split.amountSmallest // BTC smallest unit IS sats
                : split.amountSmallest
              : split.currency.toLowerCase() === "btc"
                ? Math.ceil((split.amount ?? 0) * 100000000)
                : Math.ceil(split.amount ?? 0);
          const usdAmount = await satsToUSD(sellerSats);
          splitAmountSmallest = Math.ceil(usdAmount * 100);
        } else if (typeof split.amountSmallest === "number") {
          // Already in seller-currency smallest units — trust as-is.
          splitAmountSmallest = split.amountSmallest;
        } else {
          // Legacy path for callers still sending raw amounts.
          splitAmountSmallest = toSmallestUnit(
            split.amount ?? 0,
            stripeCurrency
          );
        }

        const { percent: donationPercent, cutSmallest: donationCutSmallest } =
          await resolveDonationCut(split.sellerPubkey, splitAmountSmallest);

        splitDetails.push({
          pubkey: split.sellerPubkey,
          amountCents: splitAmountSmallest,
          accountId,
          donationPercent,
          donationCutSmallest,
          affiliateRebateSmallest:
            typeof split.affiliateRebateSmallest === "number"
              ? Math.max(
                  0,
                  Math.min(
                    split.affiliateRebateSmallest,
                    Math.max(splitAmountSmallest - donationCutSmallest - 1, 0)
                  )
                )
              : 0,
          affiliateAccountId: split.affiliateAccountId ?? null,
          affiliateId: split.affiliateId ?? null,
          affiliateCodeId: split.affiliateCodeId ?? null,
          affiliateCode: split.affiliateCode ?? null,
        });
      }

      // The sum of per-seller smallest-unit subtotals IS the buyer charge.
      // The top-level `amount` from the request is informational only in
      // multi-merchant mode — using sum-of-splits as truth guarantees that
      // every transfer in process-transfers.ts can succeed (no
      // sum-exceeds-total mismatch) and that the buyer is charged exactly
      // what each seller is owed in aggregate.
      const splitsSum = splitDetails.reduce((s, d) => s + d.amountCents, 0);
      amountInSmallestUnit = Math.max(splitsSum, 50);
    } else if (amountInSmallestUnit < 50) {
      amountInSmallestUnit = 50;
    }

    if (isMultiMerchant) {
      const description = `${productTitle}${
        productDescription ? ` - ${productDescription}` : ""
      }`;

      const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
        amount: amountInSmallestUnit,
        currency: stripeCurrency,
        description,
        transfer_group: transferGroup,
        metadata: {
          ...metadata,
          originalAmount: amount.toString(),
          originalCurrency: currency,
          isMultiMerchant: "true",
          transferGroup,
          sellerSplits: JSON.stringify(
            splitDetails.map((s) => ({
              pubkey: s.pubkey,
              amountCents: s.amountCents,
              accountId: s.accountId,
              donationPercent: s.donationPercent,
              donationCutSmallest: s.donationCutSmallest,
              affiliateRebateSmallest: s.affiliateRebateSmallest,
              affiliateAccountId: s.affiliateAccountId,
              affiliateId: s.affiliateId,
              affiliateCodeId: s.affiliateCodeId,
              affiliateCode: s.affiliateCode,
            }))
          ),
        },
        automatic_payment_methods: {
          enabled: true,
        },
      };

      if (customerEmail) {
        paymentIntentParams.receipt_email = customerEmail;
      }

      const intentRefMM = stableIdempotencyKey("mm", {
        amount: amountInSmallestUnit,
        currency: stripeCurrency,
        customerEmail: customerEmail ?? null,
        productTitle: productTitle ?? null,
        productDescription: productDescription ?? null,
        metadata: metadata ?? null,
        sellerSplits: sellerSplits ?? null,
        transferGroup,
      });
      try {
        await recordPendingPayment({
          intentRef: intentRefMM,
          amount: amountInSmallestUnit,
          currency: stripeCurrency,
          metadata: { ...metadata, transferGroup },
        });
      } catch (e) {
        console.warn("recordPendingPayment failed:", e);
      }
      const paymentIntent = await withStripeRetry(() =>
        stripe.paymentIntents.create(paymentIntentParams, {
          idempotencyKey: intentRefMM,
        })
      );
      try {
        await updatePendingPayment(intentRefMM, {
          paymentIntentId: paymentIntent.id,
          status: "created",
        });
      } catch (e) {
        console.warn("updatePendingPayment failed:", e);
      }

      return res.status(200).json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        connectedAccountId: undefined,
        isMultiMerchant: true,
        transferGroup,
        sellerSplits: splitDetails.map((s) => ({
          pubkey: s.pubkey,
          amountCents: s.amountCents,
          accountId: s.accountId,
          donationPercent: s.donationPercent,
          donationCutSmallest: s.donationCutSmallest,
          affiliateRebateSmallest: s.affiliateRebateSmallest,
          affiliateAccountId: s.affiliateAccountId,
          affiliateId: s.affiliateId,
          affiliateCodeId: s.affiliateCodeId,
          affiliateCode: s.affiliateCode,
        })),
      });
    }

    const sellerPubkey = metadata?.sellerPubkey;
    let connectedAccountId: string | null = null;

    if (sellerPubkey) {
      const isPlatformAccount =
        sellerPubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK;

      if (!isPlatformAccount) {
        const connectAccount = await getStripeConnectAccount(sellerPubkey);
        if (connectAccount && connectAccount.charges_enabled) {
          connectedAccountId = connectAccount.stripe_account_id;
        }
      }
    }

    const stripeOptions = connectedAccountId
      ? { stripeAccount: connectedAccountId }
      : undefined;

    // Single-merchant donation cut: only applied for direct charges on a
    // connected account (otherwise the funds are already on the platform).
    const { percent: singleDonationPercent, cutSmallest: singleDonationCut } =
      connectedAccountId
        ? await resolveDonationCut(sellerPubkey, amountInSmallestUnit)
        : { percent: 0, cutSmallest: 0 };

    const description = `${productTitle}${
      productDescription ? ` - ${productDescription}` : ""
    }`;

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountInSmallestUnit,
      currency: stripeCurrency,
      description,
      metadata: {
        ...metadata,
        originalAmount: amount.toString(),
        originalCurrency: currency,
        ...(connectedAccountId && { connectedAccountId }),
        ...(singleDonationCut > 0 && {
          mmDonationPercent: singleDonationPercent.toString(),
          mmDonationCutSmallest: singleDonationCut.toString(),
        }),
      },
      automatic_payment_methods: {
        enabled: true,
      },
      ...(singleDonationCut > 0 && {
        application_fee_amount: singleDonationCut,
      }),
    };

    if (customerEmail) {
      paymentIntentParams.receipt_email = customerEmail;
    }

    const intentRef = stableIdempotencyKey("pi", {
      amount: amountInSmallestUnit,
      currency: stripeCurrency,
      customerEmail: customerEmail ?? null,
      productTitle: productTitle ?? null,
      productDescription: productDescription ?? null,
      metadata: metadata ?? null,
      connectedAccountId,
    });
    try {
      await recordPendingPayment({
        intentRef,
        amount: amountInSmallestUnit,
        currency: stripeCurrency,
        metadata: { ...metadata, connectedAccountId },
      });
    } catch (e) {
      console.warn("recordPendingPayment failed:", e);
    }
    const paymentIntent = await withStripeRetry(() =>
      stripe.paymentIntents.create(paymentIntentParams, {
        ...(stripeOptions ?? {}),
        idempotencyKey: intentRef,
      })
    );
    try {
      await updatePendingPayment(intentRef, {
        paymentIntentId: paymentIntent.id,
        status: "created",
      });
    } catch (e) {
      console.warn("updatePendingPayment failed:", e);
    }

    return res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      connectedAccountId: connectedAccountId || undefined,
    });
  } catch (error) {
    console.error("Stripe PaymentIntent creation error:", error);
    return res.status(500).json({
      error: "Failed to create payment intent",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
