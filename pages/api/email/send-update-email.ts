import { NextApiRequest, NextApiResponse } from "next";
import { sendOrderUpdateToBuyer } from "@/utils/email/email-service";
import { getBuyerNotificationEmail } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    orderId,
    productTitle,
    updateType,
    message,
    trackingNumber,
    carrier,
    estimatedDelivery,
  } = req.body;

  if (!orderId || !productTitle || !updateType || !message) {
    return res.status(400).json({
      error: "orderId, productTitle, updateType, and message are required",
    });
  }

  try {
    const buyerEmail = await getBuyerNotificationEmail(orderId);

    if (!buyerEmail) {
      return res.status(200).json({
        success: true,
        emailSent: false,
        reason: "No buyer email found for this order",
      });
    }

    const emailSent = await sendOrderUpdateToBuyer(buyerEmail, {
      orderId,
      productTitle,
      updateType,
      message,
      trackingNumber,
      carrier,
      estimatedDelivery,
    });

    return res.status(200).json({ success: true, emailSent });
  } catch (error) {
    console.error("Error sending update email:", error);
    return res.status(500).json({ error: "Failed to send update email" });
  }
}
