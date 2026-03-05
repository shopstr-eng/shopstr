import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { fiat } from "@getalby/lightning-tools";
import {
  getStripeConnectAccount,
  createSubscription,
} from "@/utils/db/db-service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});

const FREQUENCY_TO_INTERVAL: Record<
  string,
  {
    interval: Stripe.PriceCreateParams.Recurring.Interval;
    interval_count: number;
  }
> = {
  weekly: { interval: "week", interval_count: 1 },
  every_2_weeks: { interval: "week", interval_count: 2 },
  monthly: { interval: "month", interval_count: 1 },
  every_2_months: { interval: "month", interval_count: 2 },
  quarterly: { interval: "month", interval_count: 3 },
};

const satsToUSD = async (sats: number): Promise<number> => {
  try {
    const usdAmount = await fiat.getFiatValue({
      satoshi: sats,
      currency: "usd",
    });
    return usdAmount;
  } catch (error) {
    console.error("Error converting sats to USD:", error);
    const btcPrice = 100000;
    return (sats / 100000000) * btcPrice;
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      customerEmail,
      productTitle,
      productDescription,
      amount,
      currency,
      frequency,
      discountPercent,
      sellerPubkey,
      buyerPubkey,
      productEventId,
      quantity,
      variantInfo,
      shippingAddress,
    } = req.body;

    if (!customerEmail) {
      return res.status(400).json({ error: "Customer email is required" });
    }
    if (!frequency || !FREQUENCY_TO_INTERVAL[frequency]) {
      return res.status(400).json({ error: "Invalid frequency" });
    }
    if (!amount || !currency) {
      return res
        .status(400)
        .json({ error: "Amount and currency are required" });
    }
    if (!sellerPubkey || !productEventId) {
      return res
        .status(400)
        .json({ error: "Seller pubkey and product event ID are required" });
    }

    let amountInCents: number;
    const currencyLower = currency.toLowerCase();

    if (currencyLower === "sats" || currencyLower === "sat") {
      const usdAmount = await satsToUSD(amount);
      amountInCents = Math.round(usdAmount * 100);
    } else if (currencyLower === "btc") {
      const sats = amount * 100000000;
      const usdAmount = await satsToUSD(sats);
      amountInCents = Math.round(usdAmount * 100);
    } else if (currencyLower === "usd") {
      amountInCents = Math.round(amount * 100);
    } else {
      amountInCents = Math.round(amount * 100);
    }

    const baseAmountInCents = amountInCents;
    const discount = discountPercent || 0;
    const subscriptionAmountInCents = Math.round(
      amountInCents * (1 - discount / 100)
    );

    if (subscriptionAmountInCents < 50) {
      return res
        .status(400)
        .json({ error: "Subscription amount too low (minimum $0.50)" });
    }

    let connectedAccountId: string | null = null;
    const isPlatformAccount =
      sellerPubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK;

    if (!isPlatformAccount) {
      const connectAccount = await getStripeConnectAccount(sellerPubkey);
      if (connectAccount && connectAccount.charges_enabled) {
        connectedAccountId = connectAccount.stripe_account_id;
      }
    }

    const stripeOptions = connectedAccountId
      ? { stripeAccount: connectedAccountId }
      : undefined;

    const customers = await stripe.customers.list(
      { email: customerEmail, limit: 1 },
      stripeOptions
    );

    let customer: any;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create(
        {
          email: customerEmail,
          metadata: {
            buyerPubkey: buyerPubkey || "",
          },
        },
        stripeOptions
      );
    }

    const description = `${productTitle}${
      productDescription ? ` - ${productDescription}` : ""
    }`;

    const product = await stripe.products.create(
      {
        name: productTitle || "Subscription Product",
        description: description || undefined,
        metadata: {
          productEventId,
          sellerPubkey,
        },
      },
      stripeOptions
    );

    const intervalConfig = FREQUENCY_TO_INTERVAL[frequency]!;
    const price = await stripe.prices.create(
      {
        product: product.id,
        unit_amount: subscriptionAmountInCents,
        currency: "usd",
        recurring: {
          interval: intervalConfig.interval,
          interval_count: intervalConfig.interval_count,
        },
      },
      stripeOptions
    );

    const subscription = await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price: price.id, quantity: quantity || 1 }],
        payment_behavior: "default_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
        },
        expand: ["latest_invoice.payment_intent"],
        metadata: {
          productEventId,
          sellerPubkey,
          buyerPubkey: buyerPubkey || "",
          frequency,
          discountPercent: discount.toString(),
          originalAmount: amount.toString(),
          originalCurrency: currency,
        },
      },
      stripeOptions
    );

    const subscriptionData = subscription as any;
    const invoice = subscriptionData.latest_invoice;
    const paymentIntent = invoice?.payment_intent;

    const nextBillingDate = subscriptionData.current_period_end
      ? new Date(subscriptionData.current_period_end * 1000)
      : null;

    await createSubscription({
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customer.id,
      buyer_pubkey: buyerPubkey || null,
      buyer_email: customerEmail,
      seller_pubkey: sellerPubkey,
      product_event_id: productEventId,
      product_title: productTitle || null,
      quantity: quantity || 1,
      variant_info: variantInfo || null,
      frequency,
      discount_percent: discount,
      base_price: baseAmountInCents / 100,
      subscription_price: subscriptionAmountInCents / 100,
      currency: "usd",
      shipping_address: shippingAddress || null,
      status: "active",
      next_billing_date: nextBillingDate,
      next_shipping_date: nextBillingDate,
    });

    return res.status(200).json({
      success: true,
      subscriptionId: subscription.id,
      clientSecret: paymentIntent?.client_secret || null,
      customerId: customer.id,
      connectedAccountId: connectedAccountId || undefined,
      status: subscriptionData.status,
      currentPeriodEnd: subscriptionData.current_period_end,
    });
  } catch (error) {
    console.error("Stripe subscription creation error:", error);
    return res.status(500).json({
      error: "Failed to create subscription",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
