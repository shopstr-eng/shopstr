import { NextApiRequest, NextApiResponse } from "next";
import {
  sendOrderConfirmationToBuyer,
  sendNewOrderToSeller,
} from "@/utils/email/email-service";
import {
  saveNotificationEmail,
  getSellerNotificationEmail,
  getUserAuthEmail,
  getEmailFlows,
  enrollInFlow,
  scheduleStepExecutions,
  getFlowEnrollments,
  getDbPool,
} from "@/utils/db/db-service";
import { deductStock } from "@/utils/db/inventory-service";

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
    productId,
    quantity,
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

    if (buyerEmail && sellerPubkey) {
      try {
        await autoEnrollInFlows({
          buyerEmail,
          buyerPubkey,
          sellerPubkey,
          orderId,
          productTitle,
          amount,
          currency,
          buyerName,
        });
      } catch (enrollError) {
        console.error("Error auto-enrolling in email flows:", enrollError);
      }
    }

    if (productId && orderId) {
      try {
        const deductQty = quantity ? parseInt(String(quantity), 10) : 1;
        const bulkMultiplier = selectedBulkOption
          ? parseInt(String(selectedBulkOption), 10)
          : 1;
        const effectiveDeductQty =
          deductQty * (isNaN(bulkMultiplier) ? 1 : bulkMultiplier);
        const variantKey = selectedSize ? `size:${selectedSize}` : "_default";
        await deductStock(productId, effectiveDeductQty, orderId, variantKey);
      } catch (invErr) {
        console.error("Inventory deduction failed (frontend order):", invErr);
      }
    }

    return res.status(200).json({ success: true, ...results });
  } catch (error) {
    console.error("Error sending order emails:", error);
    return res.status(500).json({ error: "Failed to send order emails" });
  }
}

async function autoEnrollInFlows(params: {
  buyerEmail: string;
  buyerPubkey?: string;
  sellerPubkey: string;
  orderId: string;
  productTitle: string;
  amount?: string;
  currency?: string;
  buyerName?: string;
}) {
  const {
    buyerEmail,
    buyerPubkey,
    sellerPubkey,
    orderId,
    productTitle,
    amount,
    currency,
    buyerName,
  } = params;

  const flows = await getEmailFlows(sellerPubkey);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://milk.market";
  const enrollmentData = {
    order_id: orderId,
    product_title: productTitle,
    buyer_name: buyerName || "",
    amount: amount || "N/A",
    currency: currency || "sats",
    shop_url: `${baseUrl}/${sellerPubkey}`,
  };

  const postPurchaseFlow = flows.find(
    (f) => f.flow_type === "post_purchase" && f.status === "active"
  );
  if (postPurchaseFlow) {
    const flowData = {
      ...enrollmentData,
      shop_name: postPurchaseFlow.from_name || "Milk Market",
    };
    await tryEnroll(postPurchaseFlow.id, buyerEmail, buyerPubkey, flowData);
  }

  const welcomeFlow = flows.find(
    (f) => f.flow_type === "welcome_series" && f.status === "active"
  );
  if (welcomeFlow) {
    const isFirstOrder = await checkIsFirstOrderFromSeller(
      buyerEmail,
      sellerPubkey,
      orderId
    );
    if (isFirstOrder) {
      const flowData = {
        ...enrollmentData,
        shop_name: welcomeFlow.from_name || "Milk Market",
      };
      await tryEnroll(welcomeFlow.id, buyerEmail, buyerPubkey, flowData);
    }
  }
}

async function tryEnroll(
  flowId: number,
  recipientEmail: string,
  recipientPubkey?: string,
  enrollmentData?: any
) {
  const existingEnrollments = await getFlowEnrollments(flowId);
  const alreadyEnrolled = existingEnrollments.some(
    (e) => e.recipient_email === recipientEmail && e.status === "active"
  );
  if (alreadyEnrolled) return;

  const enrollment = await enrollInFlow({
    flow_id: flowId,
    recipient_email: recipientEmail,
    recipient_pubkey: recipientPubkey || null,
    enrollment_data: enrollmentData,
  });

  await scheduleStepExecutions(enrollment.id, flowId);
}

async function checkIsFirstOrderFromSeller(
  buyerEmail: string,
  sellerPubkey: string,
  currentOrderId: string
): Promise<boolean> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query(
      `SELECT COUNT(*) as count FROM notification_emails ne
       INNER JOIN message_events me ON ne.order_id = me.order_id
       WHERE ne.email = $1 AND ne.role = 'buyer'
       AND ne.order_id != $2
       AND me.pubkey = $3`,
      [buyerEmail, currentOrderId, sellerPubkey]
    );
    return parseInt(result.rows[0].count, 10) === 0;
  } catch (error) {
    console.error("Error checking first order:", error);
    return true;
  } finally {
    if (client) client.release();
  }
}
