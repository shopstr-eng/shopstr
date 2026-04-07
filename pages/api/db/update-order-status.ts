import type { NextApiRequest, NextApiResponse } from "next";
import {
  getOrderParticipants,
  updateOrderStatus,
} from "@/utils/db/db-service";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";

const SELLER_MANAGED_STATUSES = new Set(["confirmed", "shipped", "completed"]);
const BUYER_MANAGED_STATUSES = new Set(["canceled"]);
const PARTICIPANT_MANAGED_STATUSES = new Set(["pending"]);

function canActorUpdateOrderStatus(
  actorPubkey: string,
  buyerPubkey: string | null,
  sellerPubkey: string | null,
  status: string
): boolean {
  if (actorPubkey === sellerPubkey) {
    return (
      SELLER_MANAGED_STATUSES.has(status) ||
      PARTICIPANT_MANAGED_STATUSES.has(status)
    );
  }

  if (actorPubkey === buyerPubkey) {
    return (
      BUYER_MANAGED_STATUSES.has(status) ||
      PARTICIPANT_MANAGED_STATUSES.has(status)
    );
  }

  return false;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authResult = verifyNip98Request(req, "POST");
  if (!authResult.ok) {
    return res.status(401).json({ error: authResult.error });
  }

  const { orderId, status, messageId } = req.body;

  if (!orderId || !status) {
    return res
      .status(400)
      .json({ error: "Missing required fields: orderId, status" });
  }

  const validStatuses = [
    "pending",
    "confirmed",
    "shipped",
    "completed",
    "canceled",
  ];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
    });
  }

  try {
    const { buyerPubkey, sellerPubkey } = await getOrderParticipants(
      orderId,
      messageId
    );

    if (!buyerPubkey || !sellerPubkey) {
      return res.status(404).json({
        error: "Could not resolve order participants for this order.",
      });
    }

    if (
      !canActorUpdateOrderStatus(
        authResult.pubkey,
        buyerPubkey,
        sellerPubkey,
        status
      )
    ) {
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
