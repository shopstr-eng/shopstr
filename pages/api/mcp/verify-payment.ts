import type { NextApiRequest, NextApiResponse } from "next";
import { CashuMint, CashuWallet, MintQuoteState } from "@cashu/cashu-ts";
import { authenticateRequest, initializeApiKeysTable } from "@/utils/mcp/auth";
import { getMcpOrder, updateMcpOrderPayment } from "@/mcp/tools/purchase-tools";
import { recordRequest } from "@/utils/mcp/metrics";
import { pendingLightningPayments } from "./create-order";

let tablesReady = false;

async function ensureTables() {
  if (!tablesReady) {
    await initializeApiKeysTable();
    tablesReady = true;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const requestStart = Date.now();
  await ensureTables();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const apiKey = await authenticateRequest(req, res, "read_write");
  if (!apiKey) {
    recordRequest(Date.now() - requestStart, false, "verify-payment");
    return;
  }

  const originalEnd = res.end.bind(res);
  (res as any).end = function (...args: any[]) {
    const durationMs = Date.now() - requestStart;
    res.setHeader("X-Response-Time", `${durationMs}ms`);
    recordRequest(durationMs, res.statusCode < 500, "verify-payment");
    return originalEnd(...args);
  };

  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "orderId is required" });
  }

  try {
    const order = await getMcpOrder(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.buyer_pubkey !== apiKey.pubkey) {
      return res
        .status(403)
        .json({ error: "Not authorized to verify this order" });
    }

    if (order.payment_status === "paid") {
      return res.status(200).json({
        success: true,
        status: "paid",
        message: "Payment has already been confirmed.",
        orderId,
      });
    }

    const pending = pendingLightningPayments.get(orderId);
    if (!pending) {
      if (
        order.payment_intent_id &&
        order.payment_intent_id.startsWith("fiat_")
      ) {
        return res.status(200).json({
          success: true,
          status: "pending_seller_confirmation",
          message:
            "This is a fiat payment. The seller must manually confirm receipt.",
          orderId,
        });
      }

      return res.status(400).json({
        error:
          "No pending Lightning payment found for this order. It may have expired.",
        orderId,
      });
    }

    const cashuMint = new CashuMint(pending.mintUrl);
    const wallet = new CashuWallet(cashuMint);
    const quoteStatus = await wallet.checkMintQuote(pending.quote);

    if (
      quoteStatus.state === MintQuoteState.PAID ||
      quoteStatus.state === MintQuoteState.ISSUED
    ) {
      await updateMcpOrderPayment(orderId, `ln_${pending.quote}`, "paid");
      pendingLightningPayments.delete(orderId);

      return res.status(200).json({
        success: true,
        status: "paid",
        message:
          "Lightning payment confirmed! Your order is now being processed.",
        orderId,
        payment: {
          method: "lightning",
          amount: pending.amount,
          currency: "sats",
          quoteId: pending.quote,
        },
      });
    }

    return res.status(200).json({
      success: true,
      status: "unpaid",
      message: "Payment has not been received yet. Please pay the invoice.",
      orderId,
      payment: {
        method: "lightning",
        amount: pending.amount,
        currency: "sats",
        quoteId: pending.quote,
        mintUrl: pending.mintUrl,
      },
    });
  } catch (error) {
    console.error("Payment verification failed:", error);
    return res.status(500).json({
      error: "Failed to verify payment",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
