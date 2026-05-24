import type { NextApiRequest, NextApiResponse } from "next";
import {
  savePopupEmailCapture,
  addDiscountCode,
  getPopupEmailCapture,
  getPopupEmailCaptureByPhone,
} from "@/utils/db/db-service";
import { getUncachableSendGridClient } from "@/utils/email/sendgrid-client";
import { popupDiscountEmail } from "@/utils/email/email-templates";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 };

function generateDiscountCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "WELCOME";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "storefront-popup-capture", RATE_LIMIT)) return;

  const {
    sellerPubkey,
    email,
    phone,
    discountPercentage,
    shopName,
    shippingDiscountType,
    shippingDiscountValue,
  } = req.body;

  const pct = Number(discountPercentage) || 0;
  const rawShipType = shippingDiscountType as string | undefined;
  const allowedShipTypes = ["none", "free", "percent", "fixed"] as const;
  if (
    rawShipType !== undefined &&
    !allowedShipTypes.includes(rawShipType as (typeof allowedShipTypes)[number])
  ) {
    return res.status(400).json({ error: "Invalid shipping discount type" });
  }
  const shipType =
    (rawShipType as (typeof allowedShipTypes)[number] | undefined) || "none";
  const shipVal = Number(shippingDiscountValue) || 0;

  // Reject shipping-discount configs that wouldn't actually discount shipping
  // (matches the validation in pages/api/db/discount-codes.ts for seller codes
  // so welcome codes can't be silently no-op).
  if (shipType === "percent" && (shipVal <= 0 || shipVal > 100)) {
    return res
      .status(400)
      .json({ error: "Percent shipping discount must be between 1 and 100" });
  }
  if (shipType === "fixed" && shipVal <= 0) {
    return res
      .status(400)
      .json({ error: "Fixed shipping discount must be greater than 0" });
  }
  if (pct < 0 || pct > 100) {
    return res
      .status(400)
      .json({ error: "Product discount must be between 0 and 100" });
  }

  // The welcome code must offer at least one form of discount, otherwise we'd
  // be emailing the buyer a coupon that does nothing at checkout.
  if (!sellerPubkey || !email || (pct <= 0 && shipType === "none")) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  try {
    // Reject duplicate submissions instead of silently re-issuing the existing
    // welcome code. The popup is meant for FIRST-TIME contact capture only;
    // returning the same code to a repeat submission both undermines the
    // "welcome" framing and lets one buyer farm the same incentive across
    // sessions. We check email AND phone (when provided) so a buyer can't
    // dodge by re-entering with a different email but the same phone.
    const existingByEmail = await getPopupEmailCapture(sellerPubkey, email);
    const existingByPhone = phone
      ? await getPopupEmailCaptureByPhone(sellerPubkey, phone)
      : null;
    if (existingByEmail || existingByPhone) {
      return res.status(409).json({
        error:
          "This contact info has already been used to claim a welcome offer. Please sign in or create an account to continue.",
        alreadyCaptured: true,
      });
    }

    const discountCode = generateDiscountCode();

    const expiration = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;
    await addDiscountCode(
      discountCode,
      sellerPubkey,
      pct,
      expiration,
      1,
      shipType,
      shipType === "free" ? 0 : shipVal
    );

    await savePopupEmailCapture(
      sellerPubkey,
      email,
      phone || null,
      discountCode,
      pct
    );

    try {
      const { client, fromEmail } = await getUncachableSendGridClient();
      const { subject, html } = popupDiscountEmail({
        discountCode,
        discountPercentage: pct,
        shopName: shopName || "our store",
        shippingDiscountType: shipType,
        shippingDiscountValue: shipType === "free" ? 0 : shipVal,
      });
      await client.send({
        to: email,
        from: fromEmail,
        subject,
        html,
      });
    } catch (emailErr) {
      console.error("Failed to send popup discount email:", emailErr);
    }

    return res.status(200).json({
      discountCode,
      discountPercentage,
      alreadyCaptured: false,
    });
  } catch (error) {
    console.error("Popup capture error:", error);
    return res.status(500).json({ error: "Failed to process" });
  }
}
