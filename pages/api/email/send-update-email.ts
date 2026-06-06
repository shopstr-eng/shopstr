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

// Basic, conservative email shape check for the seller-supplied fallback
// recipient. Order contents are end-to-end encrypted, so the server cannot
// independently verify a buyer's email for orders that predate (or skipped)
// the checkout notification-email capture; this keeps obviously-bad values out.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "email-send-update:ip", PER_IP_LIMIT)) {
    console.warn("[send-update-email] blocked by per-IP rate limit");
    return;
  }

  // Require a NIP-98 proof so this endpoint can't be used as an anonymous email
  // relay, and so the per-pubkey rate limit below has a real identity to key on.
  const authResult = await verifyNip98Request(req, "POST", req.body);
  if (!authResult.ok) {
    console.warn("[send-update-email] NIP-98 auth failed:", authResult.error);
    return res.status(401).json({ error: authResult.error });
  }
  console.info(
    "[send-update-email] auth ok pubkey=",
    authResult.pubkey.slice(0, 8)
  );

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
    buyerEmail: buyerEmailFromBody,
  } = req.body;

  if (!orderId || !productTitle || !updateType || !message) {
    console.warn("[send-update-email] missing required fields", {
      hasOrderId: !!orderId,
      hasProductTitle: !!productTitle,
      hasUpdateType: !!updateType,
      hasMessage: !!message,
    });
    return res.status(400).json({
      error: "orderId, productTitle, updateType, and message are required",
    });
  }

  try {
    // Order messages are stored as encrypted gift wraps, so the seller usually
    // can't be resolved from the cache. Only enforce ownership when we actually
    // can resolve it; never block the common (unresolvable) case, or no
    // shipping email would ever be delivered.
    let orderSellerPubkey: string | null = null;
    try {
      ({ sellerPubkey: orderSellerPubkey } =
        await getOrderParticipants(orderId));
    } catch (lookupError) {
      console.error("Failed to resolve order participants:", lookupError);
    }

    if (orderSellerPubkey && authResult.pubkey !== orderSellerPubkey) {
      return res.status(403).json({
        error: "Only the order's seller can send update emails for this order.",
      });
    }

    const dbBuyerEmail = await getBuyerNotificationEmail(orderId);
    const fallbackBuyerEmail =
      typeof buyerEmailFromBody === "string" &&
      EMAIL_PATTERN.test(buyerEmailFromBody.trim())
        ? buyerEmailFromBody.trim()
        : null;
    const buyerEmail = dbBuyerEmail || fallbackBuyerEmail;

    console.info("[send-update-email] recipient resolution", {
      sellerResolved: !!orderSellerPubkey,
      dbEmail: !!dbBuyerEmail,
      bodyEmailProvided: typeof buyerEmailFromBody === "string",
      bodyEmailValid: !!fallbackBuyerEmail,
      willSend: !!buyerEmail,
    });

    if (!buyerEmail) {
      return res.status(200).json({
        success: true,
        emailSent: false,
        reason: "No buyer email found for this order",
      });
    }

    // Brand the email from the authenticated caller's storefront only. Never
    // trust a body-supplied sellerPubkey here, or a caller could send mail
    // wearing another seller's branding.
    const branding = await loadStorefrontBranding(authResult.pubkey);
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

    console.info("[send-update-email] send result emailSent=", emailSent);
    return res.status(200).json({ success: true, emailSent });
  } catch (error) {
    console.error("Error sending update email:", error);
    return res.status(500).json({ error: "Failed to send update email" });
  }
}
