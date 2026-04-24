import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import {
  getStripeConnectAccount,
  createSubscription,
} from "@/utils/db/db-service";
import {
  ZERO_DECIMAL_CURRENCIES,
  isCrypto as isCryptoCurrency,
  convertToSmallestUnit,
} from "@/utils/stripe/currency";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});
import { applyRateLimit } from "@/utils/rate-limit";
import {
  withStripeRetry,
  stableIdempotencyKey,
} from "@/utils/stripe/retry-service";
import {
  getSellerDonationPercent,
  isPlatformPubkey,
  computeDonationCutSmallest,
} from "@/utils/stripe/donation";

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

interface CartItem {
  productTitle: string;
  productEventId: string;
  amount: number;
  currency: string;
  quantity: number;
  isSubscription: boolean;
  frequency?: string;
  discountPercent?: number;
  subscriptionDiscount?: number;
  sellerPubkey?: string;
  variantInfo?: {
    size?: string;
    volume?: string;
    weight?: string;
    bulk?: string;
  };
}

// Rate limit: per-IP cap to bound abuse of payment endpoints.
const RATE_LIMIT = { limit: 30, windowMs: 60000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "stripe-create-cart-subscription", RATE_LIMIT))
    return;

  try {
    const { items, customerEmail, sellerPubkey, buyerPubkey, shippingAddress } =
      req.body as {
        items: CartItem[];
        customerEmail: string;
        sellerPubkey?: string;
        buyerPubkey?: string;
        shippingAddress?: any;
      };

    if (!customerEmail) {
      return res.status(400).json({ error: "Customer email is required" });
    }
    if (!items || items.length === 0) {
      return res.status(400).json({ error: "At least one item is required" });
    }

    const subscriptionItems = items.filter((i) => i.isSubscription);
    if (subscriptionItems.length === 0) {
      return res.status(400).json({
        error:
          "No subscription items found. Use regular payment intent for one-time purchases.",
      });
    }

    for (const item of subscriptionItems) {
      if (!item.frequency || !FREQUENCY_TO_INTERVAL[item.frequency]) {
        return res
          .status(400)
          .json({ error: `Invalid frequency for item: ${item.productTitle}` });
      }
    }

    const firstFiatCurrency = items.find((i) => !isCryptoCurrency(i.currency));
    const effectiveStripeCurrency = firstFiatCurrency
      ? firstFiatCurrency.currency.toLowerCase()
      : "usd";

    const sellerPubkeys = new Set<string>();
    for (const item of items) {
      const pk = item.sellerPubkey || sellerPubkey;
      if (pk) sellerPubkeys.add(pk);
    }

    const isMultiMerchant = sellerPubkeys.size > 1;

    if (!isMultiMerchant && !sellerPubkey && sellerPubkeys.size === 0) {
      return res.status(400).json({ error: "Vendor pubkey is required" });
    }

    const effectiveSellerPubkey = sellerPubkey || [...sellerPubkeys][0]!;

    if (isMultiMerchant) {
      return handleMultiMerchantSubscription(
        items,
        customerEmail,
        buyerPubkey,
        shippingAddress,
        sellerPubkeys,
        effectiveStripeCurrency,
        res
      );
    }

    let connectedAccountId: string | null = null;
    const isPlatformAccount =
      effectiveSellerPubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK;

    if (!isPlatformAccount) {
      const connectAccount = await getStripeConnectAccount(
        effectiveSellerPubkey
      );
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

    const subscriptionLineItems: Stripe.SubscriptionCreateParams.Item[] = [];
    const oneTimeInvoiceItems: Array<{
      customer: string;
      price: string;
      quantity: number;
    }> = [];
    const allFrequencies = subscriptionItems.map((i) => i.frequency!);
    const primaryFrequency = allFrequencies[0]!;

    for (const item of subscriptionItems) {
      const { amountSmallest } = await convertToSmallestUnit(
        item.amount,
        item.currency
      );
      const discount = item.subscriptionDiscount || item.discountPercent || 0;
      const finalAmount = Math.ceil(amountSmallest * (1 - discount / 100));

      if (finalAmount < 50) {
        return res.status(400).json({
          error: `Subscription amount too low for ${item.productTitle}`,
        });
      }

      const product = await stripe.products.create(
        {
          name: item.productTitle || "Subscription Product",
          metadata: {
            productEventId: item.productEventId,
            sellerPubkey: effectiveSellerPubkey,
          },
        },
        stripeOptions
      );

      const intervalConfig = FREQUENCY_TO_INTERVAL[item.frequency!]!;
      const price = await stripe.prices.create(
        {
          product: product.id,
          unit_amount: finalAmount,
          currency: effectiveStripeCurrency,
          recurring: {
            interval: intervalConfig.interval,
            interval_count: intervalConfig.interval_count,
          },
        },
        stripeOptions
      );

      subscriptionLineItems.push({
        price: price.id,
        quantity: item.quantity || 1,
      });
    }

    const oneTimeItems = items.filter((i) => !i.isSubscription);
    for (const item of oneTimeItems) {
      const { amountSmallest } = await convertToSmallestUnit(
        item.amount,
        item.currency
      );
      const discount = item.discountPercent || 0;
      const finalAmount = Math.ceil(amountSmallest * (1 - discount / 100));

      if (finalAmount < 50) {
        return res.status(400).json({
          error: `Amount too low for ${item.productTitle}`,
        });
      }

      const product = await stripe.products.create(
        {
          name: item.productTitle || "One-Time Product",
          metadata: {
            productEventId: item.productEventId,
            sellerPubkey: effectiveSellerPubkey,
            isOneTime: "true",
          },
        },
        stripeOptions
      );

      const price = await stripe.prices.create(
        {
          product: product.id,
          unit_amount: finalAmount,
          currency: effectiveStripeCurrency,
        },
        stripeOptions
      );

      oneTimeInvoiceItems.push({
        customer: customer.id,
        price: price.id,
        quantity: item.quantity || 1,
      });
    }

    for (const invoiceItem of oneTimeInvoiceItems) {
      await stripe.invoiceItems.create(invoiceItem, stripeOptions);
    }

    const subscriptionMetadata: Record<string, string> = {
      sellerPubkey: effectiveSellerPubkey,
      buyerPubkey: buyerPubkey || "",
      isCartOrder: "true",
      subscriptionProductIds: subscriptionItems
        .map((i) => i.productEventId)
        .join(","),
      oneTimeProductIds: oneTimeItems.map((i) => i.productEventId).join(","),
      primaryFrequency,
    };

    // Apply mm_donation parity for direct-charge cart subscriptions.
    const cartDonationPercent =
      connectedAccountId && !isPlatformPubkey(effectiveSellerPubkey)
        ? await getSellerDonationPercent(effectiveSellerPubkey)
        : 0;
    const cartApplicationFeePercent =
      cartDonationPercent > 0 && cartDonationPercent < 100
        ? Math.round(cartDonationPercent * 100) / 100
        : 0;
    if (cartApplicationFeePercent > 0) {
      subscriptionMetadata.mmDonationPercent =
        cartApplicationFeePercent.toString();
    }

    const cartSubIdempotencyKey = stableIdempotencyKey("cartsub", {
      customerId: customer.id,
      subscriptionLineItems,
      oneTimeInvoiceItems,
      metadata: subscriptionMetadata,
    });
    const subscription = await withStripeRetry(() =>
      stripe.subscriptions.create(
        {
          customer: customer.id,
          items: subscriptionLineItems,
          payment_behavior: "default_incomplete",
          payment_settings: {
            save_default_payment_method: "on_subscription",
          },
          expand: ["latest_invoice.payment_intent"],
          ...(cartApplicationFeePercent > 0 && {
            application_fee_percent: cartApplicationFeePercent,
          }),
          metadata: subscriptionMetadata,
        },
        { ...(stripeOptions ?? {}), idempotencyKey: cartSubIdempotencyKey }
      )
    );

    const subscriptionData = subscription as any;
    const invoice = subscriptionData.latest_invoice;
    const paymentIntent = invoice?.payment_intent;

    const nextBillingDate = subscriptionData.current_period_end
      ? new Date(subscriptionData.current_period_end * 1000)
      : null;

    for (const item of subscriptionItems) {
      const { amountSmallest } = await convertToSmallestUnit(
        item.amount,
        item.currency
      );
      const discount = item.subscriptionDiscount || item.discountPercent || 0;
      const finalAmount = Math.ceil(amountSmallest * (1 - discount / 100));
      const divisor = ZERO_DECIMAL_CURRENCIES.has(effectiveStripeCurrency)
        ? 1
        : 100;

      await createSubscription({
        stripe_subscription_id: subscription.id,
        stripe_customer_id: customer.id,
        buyer_pubkey: buyerPubkey || null,
        buyer_email: customerEmail,
        seller_pubkey: effectiveSellerPubkey,
        product_event_id: item.productEventId,
        product_title: item.productTitle || null,
        quantity: item.quantity || 1,
        variant_info: item.variantInfo || null,
        frequency: item.frequency!,
        discount_percent: discount,
        base_price: amountSmallest / divisor,
        subscription_price: finalAmount / divisor,
        currency: effectiveStripeCurrency,
        shipping_address: shippingAddress || null,
        status: "pending",
        next_billing_date: nextBillingDate,
        next_shipping_date: nextBillingDate,
      });
    }

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
    console.error("Stripe cart subscription creation error:", error);
    return res.status(500).json({
      error: "Failed to create cart subscription",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function handleMultiMerchantSubscription(
  items: CartItem[],
  customerEmail: string,
  buyerPubkey: string | undefined,
  shippingAddress: any,
  sellerPubkeys: Set<string>,
  effectiveStripeCurrency: string,
  res: NextApiResponse
) {
  const transferGroup = `cart_sub_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 8)}`;

  const sellerAccounts: Record<string, string> = {};
  for (const pubkey of sellerPubkeys) {
    const isPlatformAccount = pubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK;
    if (!isPlatformAccount) {
      const connectAccount = await getStripeConnectAccount(pubkey);
      if (!connectAccount || !connectAccount.charges_enabled) {
        return res.status(400).json({
          error: `Vendor ${pubkey.substring(
            0,
            8
          )}... does not have Stripe enabled`,
        });
      }
      sellerAccounts[pubkey] = connectAccount.stripe_account_id;
    }
  }

  const customers = await stripe.customers.list({
    email: customerEmail,
    limit: 1,
  });

  let customer: any;
  if (customers.data.length > 0) {
    customer = customers.data[0];
  } else {
    customer = await stripe.customers.create({
      email: customerEmail,
      metadata: {
        buyerPubkey: buyerPubkey || "",
      },
    });
  }

  const subscriptionItems = items.filter((i) => i.isSubscription);
  const oneTimeItems = items.filter((i) => !i.isSubscription);
  const allFrequencies = subscriptionItems.map((i) => i.frequency!);
  const primaryFrequency = allFrequencies[0]!;

  const subscriptionLineItems: Stripe.SubscriptionCreateParams.Item[] = [];

  const sellerSplits: {
    pubkey: string;
    amountCents: number;
    accountId: string;
    donationPercent: number;
    donationCutSmallest: number;
  }[] = [];
  const sellerAmounts: Record<string, number> = {};

  for (const item of subscriptionItems) {
    const { amountSmallest } = await convertToSmallestUnit(
      item.amount,
      item.currency
    );
    const discount = item.subscriptionDiscount || item.discountPercent || 0;
    const finalAmount = Math.ceil(amountSmallest * (1 - discount / 100));

    if (finalAmount < 50) {
      return res.status(400).json({
        error: `Subscription amount too low for ${item.productTitle}`,
      });
    }

    const itemSeller = item.sellerPubkey || [...sellerPubkeys][0]!;

    const product = await stripe.products.create({
      name: item.productTitle || "Subscription Product",
      metadata: {
        productEventId: item.productEventId,
        sellerPubkey: itemSeller,
      },
    });

    const intervalConfig = FREQUENCY_TO_INTERVAL[item.frequency!]!;
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: finalAmount,
      currency: effectiveStripeCurrency,
      recurring: {
        interval: intervalConfig.interval,
        interval_count: intervalConfig.interval_count,
      },
    });

    subscriptionLineItems.push({
      price: price.id,
      quantity: item.quantity || 1,
    });

    const totalForItem = finalAmount * (item.quantity || 1);
    sellerAmounts[itemSeller] = (sellerAmounts[itemSeller] || 0) + totalForItem;
  }

  for (const item of oneTimeItems) {
    const { amountSmallest } = await convertToSmallestUnit(
      item.amount,
      item.currency
    );
    const discount = item.discountPercent || 0;
    const finalAmount = Math.ceil(amountSmallest * (1 - discount / 100));

    if (finalAmount < 50) {
      return res.status(400).json({
        error: `Amount too low for ${item.productTitle}`,
      });
    }

    const itemSeller = item.sellerPubkey || [...sellerPubkeys][0]!;

    const product = await stripe.products.create({
      name: item.productTitle || "One-Time Product",
      metadata: {
        productEventId: item.productEventId,
        sellerPubkey: itemSeller,
        isOneTime: "true",
      },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: finalAmount,
      currency: effectiveStripeCurrency,
    });

    await stripe.invoiceItems.create({
      customer: customer.id,
      price: price.id,
      quantity: item.quantity || 1,
    } as any);

    const totalForItem = finalAmount * (item.quantity || 1);
    sellerAmounts[itemSeller] = (sellerAmounts[itemSeller] || 0) + totalForItem;
  }

  for (const [pubkey, amountCents] of Object.entries(sellerAmounts)) {
    const isPlatformAccount = pubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK;
    const donationPercent = isPlatformAccount
      ? 0
      : await getSellerDonationPercent(pubkey);
    const donationCutSmallest = isPlatformAccount
      ? 0
      : computeDonationCutSmallest(amountCents, donationPercent);
    sellerSplits.push({
      pubkey,
      amountCents,
      accountId: isPlatformAccount ? "" : sellerAccounts[pubkey] || "",
      donationPercent,
      donationCutSmallest,
    });
  }

  const sellerSplitsJson = JSON.stringify(sellerSplits);
  if (sellerSplitsJson.length > 500) {
    return res.status(400).json({
      error:
        "Too many sellers in this cart for a subscription order. Please reduce the number of different sellers.",
    });
  }

  const subscriptionMetadata: Record<string, string> = {
    isMultiMerchant: "true",
    transferGroup,
    buyerPubkey: buyerPubkey || "",
    isCartOrder: "true",
    subscriptionProductIds: subscriptionItems
      .map((i) => i.productEventId)
      .join(","),
    oneTimeProductIds: oneTimeItems.map((i) => i.productEventId).join(","),
    primaryFrequency,
    sellerSplits: sellerSplitsJson,
    sellerPubkeys: [...sellerPubkeys].join(","),
  };

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: subscriptionLineItems,
    payment_behavior: "default_incomplete",
    payment_settings: {
      save_default_payment_method: "on_subscription",
    },
    expand: ["latest_invoice.payment_intent"],
    metadata: subscriptionMetadata,
    transfer_data: undefined,
  });

  const subscriptionData = subscription as any;
  const invoice = subscriptionData.latest_invoice;
  const paymentIntent = invoice?.payment_intent;

  const nextBillingDate = subscriptionData.current_period_end
    ? new Date(subscriptionData.current_period_end * 1000)
    : null;

  for (const item of subscriptionItems) {
    const { amountSmallest } = await convertToSmallestUnit(
      item.amount,
      item.currency
    );
    const discount = item.subscriptionDiscount || item.discountPercent || 0;
    const finalAmount = Math.ceil(amountSmallest * (1 - discount / 100));
    const itemSeller = item.sellerPubkey || [...sellerPubkeys][0]!;
    const divisor = ZERO_DECIMAL_CURRENCIES.has(effectiveStripeCurrency)
      ? 1
      : 100;

    await createSubscription({
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customer.id,
      buyer_pubkey: buyerPubkey || null,
      buyer_email: customerEmail,
      seller_pubkey: itemSeller,
      product_event_id: item.productEventId,
      product_title: item.productTitle || null,
      quantity: item.quantity || 1,
      variant_info: item.variantInfo || null,
      frequency: item.frequency!,
      discount_percent: discount,
      base_price: amountSmallest / divisor,
      subscription_price: finalAmount / divisor,
      currency: effectiveStripeCurrency,
      shipping_address: shippingAddress || null,
      status: "pending",
      next_billing_date: nextBillingDate,
      next_shipping_date: nextBillingDate,
    });
  }

  return res.status(200).json({
    success: true,
    subscriptionId: subscription.id,
    clientSecret: paymentIntent?.client_secret || null,
    customerId: customer.id,
    connectedAccountId: undefined,
    isMultiMerchant: true,
    transferGroup,
    sellerSplits,
    status: subscriptionData.status,
    currentPeriodEnd: subscriptionData.current_period_end,
  });
}
