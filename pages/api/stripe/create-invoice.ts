import type { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";
import { fiat } from "@getalby/lightning-tools";
import { getStripeConnectAccount } from "@/utils/db/db-service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});

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
      amount,
      currency,
      customerEmail,
      productTitle,
      productDescription,
      shippingInfo,
      metadata,
    } = req.body;

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

    let customer;
    if (customerEmail) {
      if (connectedAccountId) {
        const existingCustomers = await stripe.customers.list(
          { email: customerEmail, limit: 1 },
          { stripeAccount: connectedAccountId }
        );

        if (existingCustomers.data.length > 0) {
          customer = existingCustomers.data[0];
        } else {
          customer = await stripe.customers.create(
            {
              email: customerEmail,
              ...(shippingInfo && {
                shipping: {
                  name: shippingInfo.name,
                  address: {
                    line1: shippingInfo.address,
                    line2: shippingInfo.unit || undefined,
                    city: shippingInfo.city,
                    state: shippingInfo.state,
                    postal_code: shippingInfo.postalCode,
                    country: shippingInfo.country,
                  },
                },
              }),
            },
            { stripeAccount: connectedAccountId }
          );
        }
      } else {
        const existingCustomers = await stripe.customers.list({
          email: customerEmail,
          limit: 1,
        });

        if (existingCustomers.data.length > 0) {
          customer = existingCustomers.data[0];
        } else {
          customer = await stripe.customers.create({
            email: customerEmail,
            ...(shippingInfo && {
              shipping: {
                name: shippingInfo.name,
                address: {
                  line1: shippingInfo.address,
                  line2: shippingInfo.unit || undefined,
                  city: shippingInfo.city,
                  state: shippingInfo.state,
                  postal_code: shippingInfo.postalCode,
                  country: shippingInfo.country,
                },
              },
            }),
          });
        }
      }
    }

    const stripeOptions = connectedAccountId
      ? { stripeAccount: connectedAccountId }
      : undefined;

    const invoice = await stripe.invoices.create(
      {
        customer: customer?.id,
        collection_method: "send_invoice",
        days_until_due: 1,
        metadata: {
          ...metadata,
          originalAmount: amount.toString(),
          originalCurrency: currency,
          ...(connectedAccountId && { connectedAccountId }),
        },
      },
      stripeOptions
    );

    const invoiceItemParams: any = {
      invoice: invoice.id,
      amount: amountInCents,
      currency: "usd",
      description: `${productTitle}${
        productDescription ? ` - ${productDescription}` : ""
      }`,
    };

    if (customer?.id) {
      invoiceItemParams.customer = customer.id;
    }

    await stripe.invoiceItems.create(invoiceItemParams, stripeOptions);

    const finalizedInvoice = await stripe.invoices.finalizeInvoice(
      invoice.id,
      undefined,
      stripeOptions
    );
    await stripe.invoices.sendInvoice(invoice.id, stripeOptions);

    return res.status(200).json({
      success: true,
      invoiceId: finalizedInvoice.id,
      invoiceUrl: finalizedInvoice.hosted_invoice_url,
      connectedAccountId: connectedAccountId || undefined,
    });
  } catch (error) {
    console.error("Stripe invoice creation error:", error);
    return res.status(500).json({
      error: "Failed to create invoice",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
