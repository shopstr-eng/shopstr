import type { NextApiRequest, NextApiResponse } from "next";
import { randomBytes } from "crypto";
import { CashuMint, CashuWallet } from "@cashu/cashu-ts";
import { authenticateRequest, initializeApiKeysTable } from "@/utils/mcp/auth";
import {
  fetchAllProductsFromDb,
  fetchAllProfilesFromDb,
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

type PaymentMethod = "lightning" | "cashu";

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
    shippingAddress,
    discountCode,
    paymentMethod = "lightning",
    mintUrl,
    cashuToken,
  } = req.body as CreateOrderInput & {
    discountCode?: string;
    paymentMethod?: PaymentMethod;
    mintUrl?: string;
    cashuToken?: string;
  };

  if (!productId) {
    return res.status(400).json({ error: "productId is required" });
  }

  if (quantity < 1 || !Number.isInteger(quantity)) {
    return res
      .status(400)
      .json({ error: "quantity must be a positive integer" });
  }

  const validMethods: PaymentMethod[] = ["lightning", "cashu"];
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

    if (product.quantity !== undefined && product.quantity < quantity) {
      return res.status(400).json({
        error: "Insufficient stock",
        available: product.quantity,
        requested: quantity,
      });
    }

    const unitPrice = product.price;
    let shippingCost = product.shippingCost || 0;
    const currency = product.currency || "sats";

    if (
      product.shippingType === "Free" ||
      product.shippingType === "Free/Pickup" ||
      product.shippingType === "Pickup" ||
      product.shippingType === "N/A"
    ) {
      shippingCost = 0;
    }

    let subtotal = unitPrice * quantity;
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
      const methodDiscount = sellerProfile.paymentMethodDiscounts["bitcoin"];
      if (typeof methodDiscount === "number" && methodDiscount > 0) {
        subtotal = subtotal * (1 - methodDiscount / 100);
      }
    }

    const totalAmount = subtotal + shippingCost;
    const orderId = generateOrderId();

    const pricingBlock = {
      unitPrice,
      quantity,
      subtotal: unitPrice * quantity,
      discountPercentage: discountPercentage || undefined,
      discountedSubtotal: discountPercentage ? subtotal : undefined,
      shippingCost,
      total: totalAmount,
      currency,
    };

    if (paymentMethod === "cashu") {
      return handleCashuPayment(
        res,
        orderId,
        apiKeyId,
        buyerPubkey,
        product,
        productId,
        quantity,
        totalAmount,
        currency,
        shippingAddress || null,
        pricingBlock,
        cashuToken
      );
    }

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
      shippingAddress || null,
      pricingBlock,
      mintUrl
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
      shippingAddress,
      `ln_${mintQuote.quote}`
    );

    pendingLightningPayments.set(orderId, {
      quote: mintQuote.quote,
      mintUrl: mint,
      amount: amountInSats,
      orderId,
    });

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
      shippingAddress,
      `cashu_${orderId}`
    );

    await updateOrderPaymentStatus(orderId, "paid");

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

async function updateOrderPaymentStatus(orderId: string, status: string) {
  const { updateMcpOrderPayment } = await import("@/mcp/tools/purchase-tools");
  await updateMcpOrderPayment(orderId, `${status}_${orderId}`, status);
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
  try {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const orders = await listMcpOrders(buyerPubkey, limit, offset);
    return res.status(200).json({
      success: true,
      orders: orders.map(formatOrderForResponse),
      count: orders.length,
    });
  } catch (error) {
    console.error("Failed to list MCP orders:", error);
    return res.status(500).json({ error: "Failed to list orders" });
  }
}

export { pendingLightningPayments };
