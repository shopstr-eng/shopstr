import type { NextApiRequest, NextApiResponse } from "next";
import {
  Mint as CashuMint,
  Wallet as CashuWallet,
  MintQuoteState,
} from "@cashu/cashu-ts";
import { authenticateRequest, initializeApiKeysTable } from "@/utils/mcp/auth";
import {
  claimMcpLightningMint,
  getMcpLightningPayment,
  getMcpOrder,
  releaseMcpLightningClaim,
  setMcpLightningToken,
  updateMcpOrderPayment,
} from "@/mcp/tools/purchase-tools";
import { mintPaidQuote, sendOrderPaymentDm } from "@/utils/mcp/order-payment";
import { recordRequest } from "@/utils/mcp/metrics";
import { applyRateLimit } from "@/utils/rate-limit";

// Polled by clients waiting for invoice settlement; the cap is generous
// because polling cadence + retries can stack, but bounded so an open
// invoice loop cannot saturate the mint quote-check pipeline.
const RATE_LIMIT = { limit: 120, windowMs: 60 * 1000 };
const PER_KEY_LIMIT = { limit: 60, windowMs: 60 * 1000 };

// How long a mint claim may run before it is treated as lost. Minting is a
// single call to the mint, so a claim this old means the server stopped midway.
const MINT_CLAIM_TIMEOUT_SECONDS = 120;

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

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  if (!applyRateLimit(req, res, "mcp-verify-payment:ip", RATE_LIMIT)) {
    recordRequest(Date.now() - requestStart, false, "verify-payment");
    return;
  }

  await ensureTables();

  const apiKey = await authenticateRequest(req, res, "read_write");
  if (!apiKey) {
    recordRequest(Date.now() - requestStart, false, "verify-payment");
    return;
  }

  if (
    !applyRateLimit(
      req,
      res,
      "mcp-verify-payment:key",
      PER_KEY_LIMIT,
      String(apiKey.id)
    )
  ) {
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

    const payment = await getMcpLightningPayment(orderId);
    if (!payment) {
      return res.status(400).json({
        error: "No pending Lightning payment found for this order.",
        orderId,
      });
    }

    const paymentInfo = {
      method: "lightning",
      amount: payment.amount_sats,
      currency: "sats",
      quoteId: payment.quote_id,
    };
    const markFailed = () =>
      updateMcpOrderPayment(orderId, `failed_${orderId}`, "failed");

    // A token saved by an earlier request means the invoice is already minted
    // and only the delivery to the seller is left.
    let token = payment.seller_token;

    if (!token) {
      const cashuMint = new CashuMint(payment.mint_url);
      const wallet = new CashuWallet(cashuMint);
      await wallet.loadMint();
      const quoteStatus = await wallet.checkMintQuoteBolt11(payment.quote_id);

      if (quoteStatus.state === MintQuoteState.ISSUED) {
        // Nobody claimed the mint here, so someone else minted the invoice.
        // The money did not reach the seller, and the order cannot complete.
        if (payment.claim_age_seconds === null) {
          await markFailed();
          return res.status(409).json({
            error:
              "This invoice was already minted by someone else, so the order cannot be completed.",
            orderId,
          });
        }
        if (payment.claim_age_seconds < MINT_CLAIM_TIMEOUT_SECONDS) {
          return res.status(200).json({
            success: true,
            status: "processing",
            message: "Your payment is being settled. Check again shortly.",
            orderId,
            payment: paymentInfo,
          });
        }
        await markFailed();
        return res.status(500).json({
          error:
            "The payment was received but minting did not finish. Contact support with this order ID.",
          orderId,
        });
      }

      if (quoteStatus.state !== MintQuoteState.PAID) {
        return res.status(200).json({
          success: true,
          status: "unpaid",
          message: "Payment has not been received yet. Please pay the invoice.",
          orderId,
          payment: { ...paymentInfo, mintUrl: payment.mint_url },
        });
      }

      if (!(await claimMcpLightningMint(orderId))) {
        return res.status(200).json({
          success: true,
          status: "processing",
          message: "Your payment is being settled. Check again shortly.",
          orderId,
          payment: paymentInfo,
        });
      }

      try {
        token = await mintPaidQuote(
          payment.mint_url,
          payment.quote_id,
          payment.amount_sats
        );
      } catch (mintError) {
        // If the invoice is still PAID the mint did nothing, so the next
        // request may try again. Otherwise the mint may have gone through and
        // the claim stays, which stops a second attempt.
        const stillPaid = await wallet
          .checkMintQuoteBolt11(payment.quote_id)
          .then((quote) => quote.state === MintQuoteState.PAID)
          .catch(() => false);
        if (stillPaid) {
          await releaseMcpLightningClaim(orderId);
        }
        throw mintError;
      }

      // Saved before sending, so a failure below can be retried without
      // minting again.
      await setMcpLightningToken(orderId, token).catch((error) =>
        console.error("Failed to save minted payment token:", error)
      );
    }

    try {
      await sendOrderPaymentDm({
        orderId,
        buyerPubkey: order.buyer_pubkey,
        sellerPubkey: order.seller_pubkey,
        productAddress: payment.product_address,
        productTitle: order.product_title ?? "",
        quantity: order.quantity,
        amount: payment.amount_sats,
        token,
        selectedSpecs: payment.selected_specs ?? undefined,
        shippingAddress: order.shipping_address,
        encryptedNsec: apiKey.encrypted_nsec,
      });
    } catch (error) {
      console.error("Failed to send Lightning payment to seller:", error);
      return res.status(502).json({
        error:
          "Your payment was received but could not be delivered to the seller yet. Call verify_payment again to retry.",
        orderId,
      });
    }

    await updateMcpOrderPayment(orderId, `ln_${payment.quote_id}`, "paid");
    await setMcpLightningToken(orderId, null).catch((error) =>
      console.error("Failed to clear delivered payment token:", error)
    );

    return res.status(200).json({
      success: true,
      status: "paid",
      message:
        "Lightning payment confirmed! Your order is now being processed.",
      orderId,
      payment: paymentInfo,
    });
  } catch (error) {
    console.error("Payment verification failed:", error);
    return res.status(500).json({
      error: "Failed to verify payment",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
