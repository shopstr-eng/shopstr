import type { NextApiRequest, NextApiResponse } from "next";
import { getOrderParticipants, updateOrderStatus } from "@/utils/db/db-service";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  canActorSetOrderStatus,
  isOrderStatus,
  ORDER_STATUSES,
} from "@/utils/orders/order-status-rules";

// Order status writes sit on the buyer/seller critical path. The per-IP
// limit is generous (a buyer + seller behind shared NAT can both work many
// orders at once); the per-pubkey limit is the meaningful authority bound
// since we only call it after NIP-98 verification.
const PER_IP_LIMIT = { limit: 300, windowMs: 60 * 1000 };
const PER_PUBKEY_LIMIT = { limit: 200, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "update-order-status:ip", PER_IP_LIMIT)) return;

  const authResult = await verifyNip98Request(req, "POST", req.body);
  if (!authResult.ok) {
    return res.status(401).json({ error: authResult.error });
  }

  if (
    !applyRateLimit(
      req,
      res,
      "update-order-status:pubkey",
      PER_PUBKEY_LIMIT,
      authResult.pubkey
    )
  )
    return;

  const { orderId, status, messageId } = req.body;

  if (!orderId || !status) {
    return res
      .status(400)
      .json({ error: "Missing required fields: orderId, status" });
  }

  if (!isOrderStatus(status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${ORDER_STATUSES.join(", ")}`,
    });
  }

  try {
    const participants = await getOrderParticipants(orderId);

    if (!participants) {
      return res.status(404).json({
        error: "Could not resolve order participants for this order.",
      });
    }

    if (!canActorSetOrderStatus(authResult.pubkey, participants, status)) {
      return res.status(403).json({
        error:
          "You are not allowed to set this order status for the current order role.",
      });
    }

    await updateOrderStatus(orderId, status, authResult.pubkey, messageId);
    return res.status(200).json({ success: true, orderId, status });
  } catch (error) {
    console.error("Failed to update order status:", error);
    return res.status(500).json({ error: "Failed to update order status" });
  }
}
