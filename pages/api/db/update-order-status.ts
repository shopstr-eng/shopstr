import type { NextApiRequest, NextApiResponse } from "next";
import { updateOrderStatus } from "@/utils/db/db-service";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";

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
    await updateOrderStatus(orderId, status, authResult.pubkey, messageId);
    return res.status(200).json({ success: true, orderId, status });
  } catch (error) {
    console.error("Failed to update order status:", error);
    return res.status(500).json({ error: "Failed to update order status" });
  }
}
