import { NextApiRequest, NextApiResponse } from "next";
import {
  sendSubscriptionConfirmation,
  sendRenewalReminder,
  sendAddressChangeConfirmation,
  sendSubscriptionCancellation,
} from "@/utils/email/email-service";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 20, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "email-send-subscription", RATE_LIMIT)) return;

  const { type, buyerEmail, ...params } = req.body;

  if (!type || !buyerEmail) {
    return res.status(400).json({ error: "type and buyerEmail are required" });
  }

  try {
    let emailSent = false;

    switch (type) {
      case "confirmation":
        if (!params.productTitle || !params.frequency || !params.currency) {
          return res.status(400).json({
            error:
              "productTitle, frequency, and currency are required for confirmation emails",
          });
        }
        emailSent = await sendSubscriptionConfirmation(buyerEmail, {
          productTitle: params.productTitle,
          frequency: params.frequency,
          discountPercent: params.discountPercent || 0,
          regularPrice: params.regularPrice || "N/A",
          subscriptionPrice: params.subscriptionPrice || "N/A",
          currency: params.currency,
          nextBillingDate: params.nextBillingDate || "N/A",
          buyerName: params.buyerName,
          shippingAddress: params.shippingAddress,
          orderId: params.orderId,
          subscriptionId: params.subscriptionId,
        });
        break;

      case "renewal_reminder":
        if (!params.productTitle || !params.frequency || !params.currency) {
          return res.status(400).json({
            error:
              "productTitle, frequency, and currency are required for renewal reminder emails",
          });
        }
        emailSent = await sendRenewalReminder(buyerEmail, {
          productTitle: params.productTitle,
          frequency: params.frequency,
          discountPercent: params.discountPercent || 0,
          regularPrice: params.regularPrice || "N/A",
          subscriptionPrice: params.subscriptionPrice || "N/A",
          currency: params.currency,
          nextBillingDate: params.nextBillingDate || "N/A",
          buyerName: params.buyerName,
          shippingAddress: params.shippingAddress,
          subscriptionId: params.subscriptionId,
        });
        break;

      case "address_change":
        if (!params.productTitle || !params.newAddress) {
          return res.status(400).json({
            error:
              "productTitle and newAddress are required for address change emails",
          });
        }
        emailSent = await sendAddressChangeConfirmation(buyerEmail, {
          productTitle: params.productTitle,
          newAddress: params.newAddress,
          buyerName: params.buyerName,
          subscriptionId: params.subscriptionId,
        });
        break;

      case "cancellation":
        if (!params.productTitle || !params.endDate) {
          return res.status(400).json({
            error:
              "productTitle and endDate are required for cancellation emails",
          });
        }
        emailSent = await sendSubscriptionCancellation(buyerEmail, {
          productTitle: params.productTitle,
          buyerName: params.buyerName,
          endDate: params.endDate,
          subscriptionId: params.subscriptionId,
        });
        break;

      default:
        return res.status(400).json({
          error:
            "Invalid type. Must be one of: confirmation, renewal_reminder, address_change, cancellation",
        });
    }

    return res.status(200).json({ success: true, emailSent });
  } catch (error) {
    console.error("Error sending subscription email:", error);
    return res.status(500).json({ error: "Failed to send subscription email" });
  }
}
