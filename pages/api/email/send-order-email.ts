import { NextApiRequest, NextApiResponse } from "next";
import {
  sendOrderConfirmationToBuyer,
  sendNewOrderToSeller,
} from "@/utils/email/email-service";
import {
  saveNotificationEmail,
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
    buyerEmail,
    buyerPubkey,
    sellerPubkey,
    orderId,
    productTitle,
    amount,
    currency,
    paymentMethod,
    buyerName,
    shippingAddress,
    buyerContact,
    pickupLocation,
    selectedSize,
    selectedVolume,
    selectedWeight,
    selectedBulkOption,
    subscriptionFrequency,
  } = req.body;

  if (!orderId || !productTitle) {
    return res
      .status(400)
      .json({ error: "orderId and productTitle are required" });
  }

  const emailParams = {
    orderId,
    productTitle,
    amount: amount || "N/A",
    currency: currency || "sats",
    paymentMethod: paymentMethod || "N/A",
    buyerName,
    shippingAddress,
    buyerContact,
    pickupLocation,
    selectedSize,
    selectedVolume,
    selectedWeight,
    selectedBulkOption,
    subscriptionFrequency,
  };

  const results: { buyerEmailSent: boolean; sellerEmailSent: boolean } = {
    buyerEmailSent: false,
    sellerEmailSent: false,
  };

  try {
    if (buyerEmail) {
      await saveNotificationEmail(
        buyerEmail,
        "buyer",
        buyerPubkey || undefined,
        orderId
      );
      results.buyerEmailSent = await sendOrderConfirmationToBuyer(
        buyerEmail,
        emailParams
      );
    }

    if (sellerPubkey) {
      let sellerEmail = await getSellerNotificationEmail(sellerPubkey);
      if (!sellerEmail) {
        sellerEmail = await getUserAuthEmail(sellerPubkey);
      }

      if (sellerEmail) {
        results.sellerEmailSent = await sendNewOrderToSeller(
          sellerEmail,
          emailParams
        );
      }
    }

    return res.status(200).json({ success: true, ...results });
  } catch (error) {
    console.error("Error sending order emails:", error);
    return res.status(500).json({ error: "Failed to send order emails" });
  }
}
