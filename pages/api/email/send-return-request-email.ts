import { NextApiRequest, NextApiResponse } from "next";
import { sendReturnRequestToSeller } from "@/utils/email/email-service";
import {
  getSellerNotificationEmail,
  getUserAuthEmail,
} from "@/utils/db/db-service";

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
    requestType,
    message,
    sellerPubkey,
    buyerName,
  } = req.body;

  if (!orderId || !productTitle || !requestType || !message || !sellerPubkey) {
    return res.status(400).json({
      error:
        "orderId, productTitle, requestType, message, and sellerPubkey are required",
    });
  }

  try {
    let sellerEmail = await getSellerNotificationEmail(sellerPubkey);
    if (!sellerEmail) {
      sellerEmail = await getUserAuthEmail(sellerPubkey);
    }

    if (!sellerEmail) {
      return res.status(200).json({
        success: true,
        emailSent: false,
        reason: "No seller email found",
      });
    }

    const emailSent = await sendReturnRequestToSeller(sellerEmail, {
      orderId,
      productTitle,
      requestType,
      message,
      buyerName,
    });

    return res.status(200).json({ success: true, emailSent });
  } catch (error) {
    console.error("Error sending return request email:", error);
    return res
      .status(500)
      .json({ error: "Failed to send return request email" });
  }
}
