import type { NextApiRequest, NextApiResponse } from "next";
import { randomBytes } from "crypto";
import Stripe from "stripe";
import { CashuMint, CashuWallet } from "@cashu/cashu-ts";
import { authenticateRequest, initializeApiKeysTable } from "@/utils/mcp/auth";
import {
  fetchAllProductsFromDb,
  fetchAllProfilesFromDb,
  getStripeConnectAccount,
  validateDiscountCode,
} from "@/utils/db/db-service";
import { recordRequest } from "@/utils/mcp/metrics";
import {
  createMcpOrder,
  getMcpOrder,
  listMcpOrders,
  formatOrderForResponse,
  CreateOrderInput,
} from "@/mcp/tools/purchase-tools";
import { parseTags } from "@/utils/parsers/product-parser-functions";

const DEFAULT_MINT_URL = "https://mint.minibits.cash/Bitcoin";

const pendingLightningPayments = new Map<
  string,
  { quote: string; mintUrl: string; amount: number; orderId: string }
>();

let tablesReady = false;

async function ensureTables() {
  if (!tablesReady) {
    await initializeApiKeysTable();
    tablesReady = true;
  }
}

function generateOrderId(): string {
  return `mcp_${Date.now()}_${randomBytes(4).toString("hex")}`;
}

type PaymentMethod = "stripe" | "lightning" | "cashu" | "fiat";

async function getSellerProfile(sellerPubkey: string) {
  const profiles = await fetchAllProfilesFromDb();
  const profile = profiles.find(
    (p) => p.pubkey === sellerPubkey && (p.kind === 0 || p.kind === 30019)
  );
  if (!profile) return null;
  try {
    return JSON.parse(profile.content);
  } catch {
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const requestStart = Date.now();
  await ensureTables();

  const apiKey = await authenticateRequest(req, res, "read_write");
  if (!apiKey) {
    recordRequest(Date.now() - requestStart, false, "create-order");
    return;
  }

  const originalEnd = res.end.bind(res);
  (res as any).end = function (...args: any[]) {
    const durationMs = Date.now() - requestStart;
    res.setHeader("X-Response-Time", `${durationMs}ms`);
    recordRequest(durationMs, res.statusCode < 500, "create-order");
    return originalEnd(...args);
  };

  if (req.method === "POST") {
    return handleCreateOrder(req, res, apiKey.id, apiKey.pubkey);
  }

  if (req.method === "GET") {
    const { orderId } = req.query;
    if (orderId && typeof orderId === "string") {
      return handleGetOrder(res, orderId, apiKey.pubkey);
    }
    return handleListOrders(req, res, apiKey.pubkey);
  }

  return res.status(405).json({ error: "Method not allowed" });
}

async function handleCreateOrder(
  req: NextApiRequest,
  res: NextApiResponse,
  apiKeyId: number,
  buyerPubkey: string
) {
  const {
    productId,
    quantity = 1,
    buyerEmail,
    shippingAddress,
    selectedSize,
    selectedVolume,
    selectedWeight,
    selectedBulkUnits,
    discountCode,
    paymentMethod = "stripe",
    mintUrl,
    cashuToken,
    fiatMethod,
  } = req.body as CreateOrderInput & {
    selectedSize?: string;
    selectedVolume?: string;
    selectedWeight?: string;
    selectedBulkUnits?: number;
    discountCode?: string;
    paymentMethod?: PaymentMethod;
    mintUrl?: string;
    cashuToken?: string;
    fiatMethod?: string;
  };

  if (!productId) {
    return res.status(400).json({ error: "productId is required" });
  }

  if (quantity < 1 || !Number.isInteger(quantity)) {
    return res
      .status(400)
      .json({ error: "quantity must be a positive integer" });
  }

  const validMethods: PaymentMethod[] = [
    "stripe",
    "lightning",
    "cashu",
    "fiat",
  ];
  if (!validMethods.includes(paymentMethod)) {
    return res.status(400).json({
      error: `Invalid paymentMethod. Must be one of: ${validMethods.join(
        ", "
      )}`,
    });
  }

  try {
    const allProducts = await fetchAllProductsFromDb();
    const productEvent = allProducts.find((p) => p.id === productId);

    if (!productEvent) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product = parseTags(productEvent);
    if (!product) {
      return res.status(500).json({ error: "Failed to parse product data" });
    }

    const selectedSpecs: Record<string, any> = {};

    if (selectedSize) {
      if (!product.sizes || !product.sizes.includes(selectedSize)) {
        return res.status(400).json({
          error: `Invalid size selection: "${selectedSize}"`,
          availableSizes: product.sizes || [],
        });
      }
      const sizeStock = product.sizeQuantities?.get(selectedSize);
      if (sizeStock !== undefined && sizeStock < quantity) {
        return res.status(400).json({
          error: `Insufficient stock for size "${selectedSize}"`,
          available: sizeStock,
          requested: quantity,
        });
      }
      selectedSpecs.size = selectedSize;
    } else if (product.quantity !== undefined && product.quantity < quantity) {
      return res.status(400).json({
        error: "Insufficient stock",
        available: product.quantity,
        requested: quantity,
      });
    }

    let unitPrice = product.price;
    const currency = product.currency || "sats";

    if (selectedVolume) {
      if (!product.volumes || !product.volumes.includes(selectedVolume)) {
        return res.status(400).json({
          error: `Invalid volume selection: "${selectedVolume}"`,
          availableVolumes: product.volumes || [],
        });
      }
      const volumePrice = product.volumePrices?.get(selectedVolume);
      if (volumePrice !== undefined) {
        unitPrice = volumePrice;
      }
      selectedSpecs.volume = selectedVolume;
      selectedSpecs.volumePrice = unitPrice;
    }

    if (selectedWeight) {
      if (!product.weights || !product.weights.includes(selectedWeight)) {
        return res.status(400).json({
          error: `Invalid weight selection: "${selectedWeight}"`,
          availableWeights: product.weights || [],
        });
      }
      const weightPrice = product.weightPrices?.get(selectedWeight);
      if (weightPrice !== undefined) {
        unitPrice = weightPrice;
      }
      selectedSpecs.weight = selectedWeight;
      selectedSpecs.weightPrice = unitPrice;
    }

    let effectiveQuantity = quantity;
    let subtotal: number;

    if (selectedBulkUnits) {
      if (!product.bulkPrices || !product.bulkPrices.has(selectedBulkUnits)) {
        return res.status(400).json({
          error: `Invalid bulk tier: ${selectedBulkUnits} units`,
          availableBulkTiers: product.bulkPrices
            ? Array.from(product.bulkPrices.entries()).map(
                ([units, price]) => ({
                  units,
                  totalPrice: price,
                })
              )
            : [],
        });
      }
      const bulkTotalPrice = product.bulkPrices.get(selectedBulkUnits)!;
      subtotal = bulkTotalPrice * quantity;
      effectiveQuantity = selectedBulkUnits * quantity;
      selectedSpecs.bulk = {
        units: selectedBulkUnits,
        totalPrice: bulkTotalPrice,
        bundles: quantity,
      };
    } else {
      subtotal = unitPrice * quantity;
    }

    let shippingCost = product.shippingCost || 0;

    if (
      product.shippingType === "Free" ||
      product.shippingType === "Free/Pickup" ||
      product.shippingType === "Pickup" ||
      product.shippingType === "N/A"
    ) {
      shippingCost = 0;
    }

    let discountPercentage = 0;

    if (discountCode) {
      const discountResult = await validateDiscountCode(
        discountCode,
        product.pubkey
      );
      if (discountResult.valid && discountResult.discount_percentage) {
        discountPercentage = discountResult.discount_percentage;
        subtotal = subtotal * (1 - discountPercentage / 100);
      }
    }

    const sellerProfile = await getSellerProfile(product.pubkey);
    if (
      sellerProfile?.paymentMethodDiscounts &&
      typeof sellerProfile.paymentMethodDiscounts === "object"
    ) {
      const discountKey =
        paymentMethod === "lightning" || paymentMethod === "cashu"
          ? "bitcoin"
          : paymentMethod === "fiat" && fiatMethod
            ? fiatMethod.toLowerCase()
            : paymentMethod;
      const methodDiscount = sellerProfile.paymentMethodDiscounts[discountKey];
      if (typeof methodDiscount === "number" && methodDiscount > 0) {
        subtotal = subtotal * (1 - methodDiscount / 100);
      }
    }

    const totalAmount = subtotal + shippingCost;
    const orderId = generateOrderId();

    const pricingBlock: Record<string, any> = {
      unitPrice,
      quantity: effectiveQuantity,
      subtotal: selectedBulkUnits
        ? product.bulkPrices!.get(selectedBulkUnits)! * quantity
        : unitPrice * quantity,
      discountPercentage: discountPercentage || undefined,
      discountedSubtotal: discountPercentage ? subtotal : undefined,
      shippingCost,
      total: totalAmount,
      currency,
    };

    if (Object.keys(selectedSpecs).length > 0) {
      pricingBlock.selectedSpecs = selectedSpecs;
    }

    if (paymentMethod === "lightning") {
      return handleLightningPayment(
        res,
        orderId,
        apiKeyId,
        buyerPubkey,
        product,
        productId,
        quantity,
        totalAmount,
        currency,
        buyerEmail || null,
        shippingAddress || null,
        pricingBlock,
        mintUrl
      );
    }

    if (paymentMethod === "cashu") {
      return handleCashuPayment(
        res,
        orderId,
        apiKeyId,
        buyerPubkey,
        product,
        productId,
        effectiveQuantity,
        totalAmount,
        currency,
        buyerEmail || null,
        shippingAddress || null,
        pricingBlock,
        cashuToken
      );
    }

    if (paymentMethod === "fiat") {
      return handleFiatPayment(
        res,
        orderId,
        apiKeyId,
        buyerPubkey,
        product,
        productId,
        quantity,
        totalAmount,
        currency,
        buyerEmail || null,
        shippingAddress || null,
        pricingBlock,
        sellerProfile,
        fiatMethod
      );
    }

    return handleStripePayment(
      res,
      orderId,
      apiKeyId,
      buyerPubkey,
      product,
      productId,
      effectiveQuantity,
      totalAmount,
      currency,
      buyerEmail || null,
      shippingAddress || null,
      pricingBlock
    );
  } catch (error) {
    console.error("Failed to create MCP order:", error);
    return res.status(500).json({
      error: "Failed to create order",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function handleLightningPayment(
  res: NextApiResponse,
  orderId: string,
  apiKeyId: number,
  buyerPubkey: string,
  product: any,
  productId: string,
  quantity: number,
  totalAmount: number,
  currency: string,
  buyerEmail: string | null,
  shippingAddress: Record<string, string> | null,
  pricingBlock: any,
  mintUrl?: string
) {
  const mint = mintUrl || DEFAULT_MINT_URL;

  let amountInSats: number;
  if (currency.toLowerCase() === "sats" || currency.toLowerCase() === "sat") {
    amountInSats = Math.round(totalAmount);
  } else {
    amountInSats = Math.round(totalAmount);
  }

  if (amountInSats < 1) amountInSats = 1;

  try {
    const cashuMint = new CashuMint(mint);
    const wallet = new CashuWallet(cashuMint);
    const mintQuote = await wallet.createMintQuote(amountInSats);

    const order = await createMcpOrder(
      orderId,
      apiKeyId,
      buyerPubkey,
      product.pubkey,
      productId,
      product.title,
      quantity,
      totalAmount,
      currency,
      buyerEmail,
      shippingAddress,
      `ln_${mintQuote.quote}`
    );

    pendingLightningPayments.set(orderId, {
      quote: mintQuote.quote,
      mintUrl: mint,
      amount: amountInSats,
      orderId,
    });

    await sendOrderEmail(
      buyerEmail,
      buyerPubkey,
      product,
      orderId,
      totalAmount,
      currency,
      "lightning"
    );

    return res.status(402).json({
      status: "payment_required",
      message:
        "Lightning invoice created. Pay the invoice to complete your order.",
      paymentMethod: "lightning",
      order: formatOrderForResponse(order),
      payment: {
        bolt11: mintQuote.request,
        quoteId: mintQuote.quote,
        amount: amountInSats,
        currency: "sats",
        mintUrl: mint,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        instructions: {
          step1: "Pay the bolt11 Lightning invoice using any Lightning wallet",
          step2: `Verify payment: POST /api/mcp/verify-payment with { "orderId": "${orderId}" }`,
          step3:
            "Once the invoice is paid, the order status will update to confirmed",
        },
      },
      pricing: pricingBlock,
    });
  } catch (error) {
    console.error("Lightning invoice generation failed:", error);
    return res.status(500).json({
      error: "Failed to generate Lightning invoice",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function handleCashuPayment(
  res: NextApiResponse,
  orderId: string,
  apiKeyId: number,
  buyerPubkey: string,
  product: any,
  productId: string,
  quantity: number,
  totalAmount: number,
  currency: string,
  buyerEmail: string | null,
  shippingAddress: Record<string, string> | null,
  pricingBlock: any,
  cashuToken?: string
) {
  if (!cashuToken) {
    return res.status(400).json({
      error:
        "cashuToken is required for Cashu payments. Provide a serialized Cashu token string.",
      example: {
        paymentMethod: "cashu",
        cashuToken: "cashuBo2F0...",
      },
    });
  }

  try {
    const { getDecodedToken } = await import("@cashu/cashu-ts");
    const decoded = getDecodedToken(cashuToken);

    if (!decoded || !decoded.proofs || decoded.proofs.length === 0) {
      return res.status(400).json({
        error: "Invalid Cashu token: no proofs found",
      });
    }

    const tokenAmount = decoded.proofs.reduce(
      (sum: number, p: any) => sum + (p.amount || 0),
      0
    );

    let requiredAmount: number;
    if (currency.toLowerCase() === "sats" || currency.toLowerCase() === "sat") {
      requiredAmount = Math.round(totalAmount);
    } else {
      requiredAmount = Math.round(totalAmount);
    }

    if (tokenAmount < requiredAmount) {
      return res.status(400).json({
        error: "Insufficient Cashu token amount",
        provided: tokenAmount,
        required: requiredAmount,
        currency: "sats",
      });
    }

    const tokenMintUrl = decoded.mint;
    if (tokenMintUrl) {
      try {
        const cashuMint = new CashuMint(tokenMintUrl);
        const wallet = new CashuWallet(cashuMint);
        await wallet.receive(cashuToken);
      } catch (redeemError) {
        console.error("Cashu token redemption failed:", redeemError);
        return res.status(400).json({
          error:
            "Failed to redeem Cashu token. It may be invalid or already spent.",
          details:
            redeemError instanceof Error
              ? redeemError.message
              : "Unknown error",
        });
      }
    }

    const order = await createMcpOrder(
      orderId,
      apiKeyId,
      buyerPubkey,
      product.pubkey,
      productId,
      product.title,
      quantity,
      totalAmount,
      currency,
      buyerEmail,
      shippingAddress,
      `cashu_${orderId}`
    );

    await updateOrderPaymentStatus(orderId, "paid");
    await sendOrderEmail(
      buyerEmail,
      buyerPubkey,
      product,
      orderId,
      totalAmount,
      currency,
      "cashu"
    );

    return res.status(201).json({
      success: true,
      paymentMethod: "cashu",
      message: "Payment received via Cashu tokens. Order confirmed.",
      order: formatOrderForResponse({ ...order, payment_status: "paid" }),
      payment: {
        method: "cashu",
        amount: tokenAmount,
        required: requiredAmount,
        status: "paid",
        change: tokenAmount > requiredAmount ? tokenAmount - requiredAmount : 0,
      },
      pricing: pricingBlock,
    });
  } catch (error) {
    console.error("Cashu payment failed:", error);
    return res.status(500).json({
      error: "Failed to process Cashu payment",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function handleFiatPayment(
  res: NextApiResponse,
  orderId: string,
  apiKeyId: number,
  buyerPubkey: string,
  product: any,
  productId: string,
  quantity: number,
  totalAmount: number,
  currency: string,
  buyerEmail: string | null,
  shippingAddress: Record<string, string> | null,
  pricingBlock: any,
  sellerProfile: any,
  fiatMethod?: string
) {
  const fiatOptions = sellerProfile?.fiat_options || [];
  if (fiatOptions.length === 0) {
    return res.status(400).json({
      error:
        "This seller does not accept fiat payments. Try lightning, cashu, or stripe.",
    });
  }

  if (fiatMethod) {
    const methodExists = fiatOptions.some(
      (opt: string) => opt.toLowerCase() === fiatMethod.toLowerCase()
    );
    if (!methodExists) {
      return res.status(400).json({
        error: `Seller does not accept "${fiatMethod}". Available fiat options: ${fiatOptions.join(
          ", "
        )}`,
      });
    }
  }

  const order = await createMcpOrder(
    orderId,
    apiKeyId,
    buyerPubkey,
    product.pubkey,
    productId,
    product.title,
    quantity,
    totalAmount,
    currency,
    buyerEmail,
    shippingAddress,
    `fiat_${fiatMethod || "unspecified"}_${orderId}`
  );

  await sendOrderEmail(
    buyerEmail,
    buyerPubkey,
    product,
    orderId,
    totalAmount,
    currency,
    fiatMethod || "fiat"
  );

  return res.status(402).json({
    status: "payment_required",
    message:
      "Order created. Complete payment using the seller's fiat payment details below.",
    paymentMethod: "fiat",
    order: formatOrderForResponse(order),
    payment: {
      method: "fiat",
      selectedMethod: fiatMethod || null,
      availableMethods: fiatOptions,
      amount: totalAmount,
      currency,
      sellerContact: {
        name: sellerProfile?.name || sellerProfile?.display_name || null,
        nip05: sellerProfile?.nip05 || null,
      },
      instructions: {
        step1: `Send ${totalAmount} ${currency} via ${
          fiatMethod || "one of the available methods"
        } to the seller`,
        step2: "Include your order ID in the payment note/memo: " + orderId,
        step3:
          "The seller will manually confirm receipt and update your order status",
      },
    },
    pricing: pricingBlock,
  });
}

async function handleStripePayment(
  res: NextApiResponse,
  orderId: string,
  apiKeyId: number,
  buyerPubkey: string,
  product: any,
  productId: string,
  quantity: number,
  totalAmount: number,
  currency: string,
  buyerEmail: string | null,
  shippingAddress: Record<string, string> | null,
  pricingBlock: any
) {
  let paymentIntentId: string | null = null;
  let clientSecret: string | null = null;
  let connectedAccountId: string | null = null;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey) {
    try {
      const stripe = new Stripe(stripeKey, {
        apiVersion: "2025-09-30.clover",
      });

      let amountInCents = Math.round(totalAmount * 100);
      if (amountInCents < 50) amountInCents = 50;

      const sellerPubkey = product.pubkey;
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

      const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
        amount: amountInCents,
        currency: "usd",
        description: `MCP Order: ${product.title}`,
        metadata: {
          orderId,
          productId,
          buyerPubkey,
          sellerPubkey: product.pubkey,
          source: "mcp",
        },
        automatic_payment_methods: { enabled: true },
      };

      if (buyerEmail) {
        paymentIntentParams.receipt_email = buyerEmail;
      }

      const paymentIntent = await stripe.paymentIntents.create(
        paymentIntentParams,
        stripeOptions
      );

      paymentIntentId = paymentIntent.id;
      clientSecret = paymentIntent.client_secret;
    } catch (stripeError) {
      console.error("Stripe payment intent creation failed:", stripeError);
      return res.status(500).json({
        error: "Failed to create payment intent",
        details:
          stripeError instanceof Error ? stripeError.message : "Unknown error",
      });
    }
  }

  const order = await createMcpOrder(
    orderId,
    apiKeyId,
    buyerPubkey,
    product.pubkey,
    productId,
    product.title,
    quantity,
    totalAmount,
    currency,
    buyerEmail,
    shippingAddress,
    paymentIntentId
  );

  await sendOrderEmail(
    buyerEmail,
    buyerPubkey,
    product,
    orderId,
    totalAmount,
    currency,
    "stripe"
  );

  if (paymentIntentId && clientSecret) {
    return res.status(402).json({
      status: "payment_required",
      message:
        "Order created successfully. Payment is required to complete the order.",
      paymentMethod: "stripe",
      order: formatOrderForResponse(order),
      payment: {
        amount: totalAmount,
        currency,
        paymentIntentId,
        clientSecret,
        connectedAccountId: connectedAccountId || undefined,
        instructions: {
          step1:
            "Use the clientSecret with Stripe.js or Stripe SDK to confirm the payment",
          step2:
            "Call stripe.confirmPayment({ clientSecret }) with a valid payment method",
          step3:
            "Once payment is confirmed, the order status will be updated automatically",
          documentationUrl: "https://docs.stripe.com/payments/accept-a-payment",
        },
      },
      pricing: pricingBlock,
    });
  }

  return res.status(201).json({
    success: true,
    paymentMethod: "stripe",
    order: formatOrderForResponse(order),
    payment: null,
    pricing: pricingBlock,
  });
}

async function updateOrderPaymentStatus(orderId: string, status: string) {
  const { updateMcpOrderPayment } = await import("@/mcp/tools/purchase-tools");
  await updateMcpOrderPayment(orderId, `${status}_${orderId}`, status);
}

async function sendOrderEmail(
  buyerEmail: string | null,
  buyerPubkey: string,
  product: any,
  orderId: string,
  totalAmount: number,
  currency: string,
  paymentMethod: string
) {
  if (!buyerEmail) return;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
    if (baseUrl) {
      await fetch(`${baseUrl}/api/email/send-order-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerEmail,
          buyerPubkey,
          sellerPubkey: product.pubkey,
          orderId,
          productTitle: product.title,
          amount: totalAmount,
          currency,
          paymentMethod,
        }),
      });
    }
  } catch (emailError) {
    console.error("Failed to send order email:", emailError);
  }
}

async function handleGetOrder(
  res: NextApiResponse,
  orderId: string,
  buyerPubkey: string
) {
  try {
    const order = await getMcpOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.buyer_pubkey !== buyerPubkey) {
      return res
        .status(403)
        .json({ error: "Not authorized to view this order" });
    }

    return res.status(200).json({
      success: true,
      order: formatOrderForResponse(order),
    });
  } catch (error) {
    console.error("Failed to get MCP order:", error);
    return res.status(500).json({ error: "Failed to get order" });
  }
}

async function handleListOrders(
  req: NextApiRequest,
  res: NextApiResponse,
  buyerPubkey: string
) {
  const limit = Math.min(parseInt(String(req.query.limit || "50")), 100);
  const offset = parseInt(String(req.query.offset || "0"));

  try {
    const orders = await listMcpOrders(buyerPubkey, limit, offset);
    return res.status(200).json({
      success: true,
      orders: orders.map(formatOrderForResponse),
      pagination: { limit, offset, count: orders.length },
    });
  } catch (error) {
    console.error("Failed to list MCP orders:", error);
    return res.status(500).json({ error: "Failed to list orders" });
  }
}

export { pendingLightningPayments };
