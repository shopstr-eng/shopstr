import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { getStripeConnectAccount } from "@/utils/db/db-service";
import { isCrypto, toSmallestUnit, satsToUSD } from "@/utils/stripe/currency";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});

interface SellerSplit {
  sellerPubkey: string;
  amount: number;
  currency: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
      amountInSmallestUnit = Math.round(usdAmount * 100);
      stripeCurrency = "usd";
    } else {
      amountInSmallestUnit = toSmallestUnit(amount, currency);
      stripeCurrency = currency.toLowerCase();
    }

    if (amountInSmallestUnit < 50) {
      amountInSmallestUnit = 50;
    }

    const isMultiMerchant =
      sellerSplits && Array.isArray(sellerSplits) && sellerSplits.length > 1;

    if (isMultiMerchant) {
      const transferGroup = `cart_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}`;

      const splitDetails: {
        pubkey: string;
        amountCents: number;
        accountId: string;
      }[] = [];

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
          let sats =
            split.currency.toLowerCase() === "btc"
              ? split.amount * 100000000
              : split.amount;
          const usdAmount = await satsToUSD(sats);
          splitAmountSmallest = Math.round(usdAmount * 100);
        } else {
          splitAmountSmallest = toSmallestUnit(split.amount, stripeCurrency);
        }

        splitDetails.push({
          pubkey: split.sellerPubkey,
          amountCents: splitAmountSmallest,
          accountId,
        });
      }

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

      const paymentIntent =
        await stripe.paymentIntents.create(paymentIntentParams);

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
      },
      automatic_payment_methods: {
        enabled: true,
      },
    };

    if (customerEmail) {
      paymentIntentParams.receipt_email = customerEmail;
    }

    const paymentIntent = await stripe.paymentIntents.create(
      paymentIntentParams,
      stripeOptions
    );

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
