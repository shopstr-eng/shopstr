import type { NextApiRequest, NextApiResponse } from "next";
import {
  savePopupEmailCapture,
  addDiscountCode,
  getPopupEmailCapture,
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

  const { sellerPubkey, email, phone, discountPercentage, shopName } = req.body;

  if (!sellerPubkey || !email || !discountPercentage) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  try {
    const existing = await getPopupEmailCapture(sellerPubkey, email);
    if (existing) {
      return res.status(200).json({
        discountCode: existing.discount_code,
        discountPercentage: existing.discount_percentage,
        alreadyCaptured: true,
      });
    }

    const discountCode = generateDiscountCode();

    const expiration = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;
    await addDiscountCode(
      discountCode,
      sellerPubkey,
      discountPercentage,
      expiration,
      1
    );

    await savePopupEmailCapture(
      sellerPubkey,
      email,
      phone || null,
      discountCode,
      discountPercentage
    );

    try {
      const { client, fromEmail } = await getUncachableSendGridClient();
      const { subject, html } = popupDiscountEmail({
        discountCode,
        discountPercentage,
        shopName: shopName || "our store",
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
