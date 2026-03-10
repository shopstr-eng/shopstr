import { NextApiRequest, NextApiResponse } from "next";
import {
  getUnenrolledAbandonedCarts,
  markCartEnrolled,
  getEmailFlows,
  enrollInFlow,
  scheduleStepExecutions,
  getFlowEnrollments,
} from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = req.headers["x-flow-processor-secret"] || req.body?.secret;
  const expectedSecret = process.env.FLOW_PROCESSOR_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const staleMinutes = Math.max(parseInt(req.body?.stale_minutes) || 60, 15);

  try {
    const carts = await getUnenrolledAbandonedCarts(staleMinutes);

    if (carts.length === 0) {
      return res.status(200).json({ processed: 0, enrolled: 0, skipped: 0 });
    }

    let enrolled = 0;
    let skipped = 0;
    const errors: string[] = [];

    const sellerFlowCache: Record<string, any> = {};

    for (const cart of carts) {
      try {
        if (!sellerFlowCache[cart.seller_pubkey]) {
          const flows = await getEmailFlows(cart.seller_pubkey);
          sellerFlowCache[cart.seller_pubkey] = flows.find(
            (f) => f.flow_type === "abandoned_cart" && f.status === "active"
          );
        }

        const activeFlow = sellerFlowCache[cart.seller_pubkey];

        if (!activeFlow) {
          await markCartEnrolled(cart.id);
          skipped++;
          continue;
        }

        const existingEnrollments = await getFlowEnrollments(activeFlow.id);
        const alreadyEnrolled = existingEnrollments.some(
          (e) => e.recipient_email === cart.buyer_email && e.status === "active"
        );

        if (alreadyEnrolled) {
          await markCartEnrolled(cart.id);
          skipped++;
          continue;
        }

        let cartItemsSummary = "";
        try {
          const items =
            typeof cart.cart_items === "string"
              ? JSON.parse(cart.cart_items)
              : cart.cart_items;
          if (Array.isArray(items) && items.length > 0) {
            cartItemsSummary = items
              .map((i: any) => i.title || i.name || "Item")
              .join(", ");
          }
        } catch {
          cartItemsSummary = "";
        }

        const baseUrl =
          process.env.NEXT_PUBLIC_BASE_URL || "https://milk.market";

        const enrollmentData = {
          buyer_name: "",
          product_title: cartItemsSummary || "your creamy goodness",
          shop_name: activeFlow.from_name || "Milk Market",
          shop_url: `${baseUrl}/${cart.seller_pubkey}`,
        };

        const enrollment = await enrollInFlow({
          flow_id: activeFlow.id,
          recipient_email: cart.buyer_email,
          recipient_pubkey: cart.buyer_pubkey,
          enrollment_data: enrollmentData,
        });

        await scheduleStepExecutions(enrollment.id, activeFlow.id);
        await markCartEnrolled(cart.id);
        enrolled++;
      } catch (error: any) {
        errors.push(`Cart ${cart.id}: ${error?.message || "Unknown error"}`);
        skipped++;
      }
    }

    return res.status(200).json({
      processed: carts.length,
      enrolled,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error processing abandoned carts:", error);
    return res.status(500).json({ error: "Failed to process abandoned carts" });
  }
}
