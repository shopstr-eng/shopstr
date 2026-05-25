import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import {
  getStripeConnectAccount,
  createSubscription,
} from "@/utils/db/db-service";
import {
  ZERO_DECIMAL_CURRENCIES,
  convertToSmallestUnit,
} from "@/utils/stripe/currency";
import {
  computeBuyerDiscountSmallest,
  isAffiliateCodeValid,
  isSelfReferral,
  lookupAffiliateCode,
} from "@/utils/db/affiliates";

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

// Rate limit: per-IP cap to bound abuse of payment endpoints.
const RATE_LIMIT = { limit: 30, windowMs: 60000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "stripe-create-subscription", RATE_LIMIT))
    return;

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
      // Affiliate fields — when present, the affiliate's buyer discount is
      // applied via a Stripe Coupon with `duration: "once"` so it only
      // reduces the FIRST invoice (the immediate charge that creates the
      // subscription). Renewals continue at the full subscribe-and-save
      // price. The webhook calls record-referral only on the first
      // invoice via `billing_reason === "subscription_create"`. The server
      // re-validates the code and recomputes the discount from the
      // authoritative code config — client-supplied discount values are
      // ignored to prevent unauthorized discounting.
      affiliateCode,
      // `affiliateGrossSubtotalSmallest` is intentionally NOT destructured
      // from the request body: the server recomputes the gross subtotal
      // itself (`affiliateGrossSmallestValidated`) so a malicious client
      // can't inflate the affiliate-referral basis.
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
        .json({ error: "Vendor pubkey and product event ID are required" });
    }

    const { amountSmallest, stripeCurrency } = await convertToSmallestUnit(
      amount,
      currency
    );

    const baseAmountSmallest = amountSmallest;
    const discount = discountPercent || 0;
    const subscriptionAmountSmallest = Math.ceil(
      amountSmallest * (1 - discount / 100)
    );

    if (subscriptionAmountSmallest < 50) {
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
        unit_amount: subscriptionAmountSmallest,
        currency: stripeCurrency,
        recurring: {
          interval: intervalConfig.interval,
          interval_count: intervalConfig.interval_count,
        },
      },
      stripeOptions
    );

    // Server-side affiliate validation: look up the code, verify it's
    // valid + not self-referral, recompute the buyer discount from the
    // authoritative code config (NEVER trust client-supplied amounts), and
    // create a `duration: "once"` Stripe Coupon so the discount applies
    // only to the first invoice.
    let affiliateCouponId: string | null = null;
    let validatedAffiliate: Awaited<
      ReturnType<typeof lookupAffiliateCode>
    > | null = null;
    let affiliateDiscountAmount = 0;
    let affiliateGrossSmallestValidated = 0;
    let affiliateCodeIdValidated: number | null = null;
    let affiliateIdValidated: number | null = null;

    if (affiliateCode && sellerPubkey) {
      try {
        const found = await lookupAffiliateCode(
          sellerPubkey,
          String(affiliateCode)
        );
        if (
          found &&
          (await isAffiliateCodeValid(found)) &&
          !(
            found.affiliate &&
            isSelfReferral(sellerPubkey, found.affiliate.affiliate_pubkey)
          )
        ) {
          // Fixed-currency codes must match the order currency; otherwise
          // skip the discount silently (the order still goes through).
          const currencyMatches =
            !found.currency ||
            String(stripeCurrency).toLowerCase() ===
              found.currency.toLowerCase() ||
            (found.buyer_discount_type !== "fixed" &&
              found.rebate_type !== "fixed");
          if (currencyMatches) {
            // Use ONLY the server-authoritative subscription charge as
            // gross. Never trust client-supplied gross hints — a tampered
            // value could inflate the discount and the referral rebate.
            const grossForDiscount = subscriptionAmountSmallest;
            const serverDiscount = computeBuyerDiscountSmallest(
              grossForDiscount,
              found.buyer_discount_type,
              Number(found.buyer_discount_value)
            );
            affiliateDiscountAmount = Math.min(
              serverDiscount,
              Math.max(subscriptionAmountSmallest - 50, 0)
            );
            affiliateGrossSmallestValidated = grossForDiscount;
            affiliateCodeIdValidated = found.id;
            affiliateIdValidated = found.affiliate_id;
            validatedAffiliate = found;
          }
        }
      } catch (lookupErr) {
        console.warn(
          "Affiliate code lookup failed; subscription will be billed at full price:",
          lookupErr
        );
      }
    }

    if (validatedAffiliate && affiliateDiscountAmount > 0) {
      try {
        const coupon = await withStripeRetry(() =>
          stripe.coupons.create(
            {
              amount_off: affiliateDiscountAmount,
              currency: stripeCurrency,
              duration: "once",
              name: `Affiliate ${String(affiliateCode).slice(0, 32)} (first payment)`,
              metadata: {
                affiliateCode: String(affiliateCode),
                affiliateCodeId: String(affiliateCodeIdValidated),
                affiliateId: String(affiliateIdValidated),
              },
            },
            stripeOptions
          )
        );
        affiliateCouponId = coupon.id;
      } catch (couponErr) {
        console.warn(
          "Failed to create affiliate coupon; subscription will be billed at full price:",
          couponErr
        );
      }
    }

    const subscriptionIdempotencyKey = stableIdempotencyKey("sub", {
      customerId: customer.id,
      priceId: price.id,
      quantity: quantity || 1,
      productEventId,
      sellerPubkey,
      buyerPubkey: buyerPubkey || "",
      frequency,
      discountPercent: discount,
      originalAmount: amount,
      originalCurrency: currency,
    });
    // Apply mm_donation as application_fee_percent for direct-charge
    // subscriptions on a connected account (parity with Bitcoin paths).
    const donationPercent =
      connectedAccountId && !isPlatformPubkey(sellerPubkey)
        ? await getSellerDonationPercent(sellerPubkey)
        : 0;
    const applicationFeePercent =
      donationPercent > 0 && donationPercent < 100
        ? Math.round(donationPercent * 100) / 100
        : 0;

    const subscription = await withStripeRetry(() =>
      stripe.subscriptions.create(
        {
          customer: customer.id,
          items: [{ price: price.id, quantity: quantity || 1 }],
          payment_behavior: "default_incomplete",
          payment_settings: {
            save_default_payment_method: "on_subscription",
          },
          expand: ["latest_invoice.payment_intent"],
          ...(applicationFeePercent > 0 && {
            application_fee_percent: applicationFeePercent,
          }),
          ...(affiliateCouponId && {
            discounts: [{ coupon: affiliateCouponId }],
          }),
          metadata: {
            productEventId,
            sellerPubkey,
            buyerPubkey: buyerPubkey || "",
            frequency,
            discountPercent: discount.toString(),
            originalAmount: amount.toString(),
            originalCurrency: currency,
            ...(applicationFeePercent > 0 && {
              mmDonationPercent: applicationFeePercent.toString(),
            }),
            // Only stamp affiliate metadata when a coupon was actually
            // attached to the subscription. The webhook keys off this
            // metadata to record the referral on the first invoice — if no
            // discount was applied, no referral should be recorded.
            ...(affiliateCouponId &&
              validatedAffiliate && {
                affiliateCode: String(affiliateCode),
                affiliateCodeId: String(affiliateCodeIdValidated),
                affiliateId: String(affiliateIdValidated),
                affiliateGrossSubtotalSmallest: String(
                  affiliateGrossSmallestValidated
                ),
                affiliateBuyerDiscountSmallest: String(affiliateDiscountAmount),
              }),
          },
        },
        { ...(stripeOptions ?? {}), idempotencyKey: subscriptionIdempotencyKey }
      )
    );

    const subscriptionData = subscription as any;
    const invoice = subscriptionData.latest_invoice;
    const paymentIntent = invoice?.payment_intent;

    const nextBillingDate = subscriptionData.current_period_end
      ? new Date(subscriptionData.current_period_end * 1000)
      : null;

    const divisor = ZERO_DECIMAL_CURRENCIES.has(stripeCurrency) ? 1 : 100;

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
      base_price: baseAmountSmallest / divisor,
      subscription_price: subscriptionAmountSmallest / divisor,
      currency: stripeCurrency,
      shipping_address: shippingAddress || null,
      status: "pending",
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
