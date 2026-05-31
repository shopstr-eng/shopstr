import { NextApiRequest, NextApiResponse } from "next";
import { sendOrderUpdateToBuyer } from "@/utils/email/email-service";
import {
  getBuyerNotificationEmail,
  getOrderParticipants,
} from "@/utils/db/db-service";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import { applyRateLimit } from "@/utils/rate-limit";
import { loadStorefrontBranding } from "@/utils/email/storefront-branding";

const PER_IP_LIMIT = { limit: 30, windowMs: 60 * 1000 };
const PER_PUBKEY_LIMIT = { limit: 30, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "email-send-update:ip", PER_IP_LIMIT)) return;

  // Sending an order-update email exposes (and, via the fallback, can target)
  // the buyer's contact email, so require the same NIP-98 seller proof used by
  // the order-status write path before doing anything else.
  const authResult = await verifyNip98Request(req, "POST", req.body);
  if (!authResult.ok) {
    return res.status(401).json({ error: authResult.error });
  }

  if (
    !applyRateLimit(
      req,
      res,
      "email-send-update:pubkey",
      PER_PUBKEY_LIMIT,
      authResult.pubkey
    )
  )
    return;

  const {
    orderId,
    productTitle,
    updateType,
    message,
    trackingNumber,
    carrier,
    estimatedDelivery,
    sellerPubkey,
    buyerEmail: buyerEmailFromBody,
  } = req.body;

  if (!orderId || !productTitle || !updateType || !message) {
    return res.status(400).json({
      error: "orderId, productTitle, updateType, and message are required",
    });
  }

  try {
    const { sellerPubkey: orderSellerPubkey } =
      await getOrderParticipants(orderId);

    if (!orderSellerPubkey) {
      return res.status(404).json({
        error: "Could not resolve the seller for this order.",
      });
    }

    if (authResult.pubkey !== orderSellerPubkey) {
      return res.status(403).json({
        error: "Only the order's seller can send update emails for this order.",
      });
    }

    const buyerEmail =
      (await getBuyerNotificationEmail(orderId)) ||
      (typeof buyerEmailFromBody === "string" &&
      buyerEmailFromBody.includes("@")
        ? buyerEmailFromBody.trim()
        : null);

    if (!buyerEmail) {
      return res.status(200).json({
        success: true,
        emailSent: false,
        reason: "No buyer email found for this order",
      });
    }

    const branding = await loadStorefrontBranding(
      sellerPubkey || orderSellerPubkey
    );
    const emailSent = await sendOrderUpdateToBuyer(
      buyerEmail,
      {
        orderId,
        productTitle,
        updateType,
        message,
        trackingNumber,
        carrier,
        estimatedDelivery,
      },
      branding
    );

    return res.status(200).json({ success: true, emailSent });
  } catch (error) {
    console.error("Error sending update email:", error);
    return res.status(500).json({ error: "Failed to send update email" });
  }
}
