import type { NextApiRequest, NextApiResponse } from "next";
import { markMessagesAsRead } from "@/utils/db/db-service";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import { applyRateLimit } from "@/utils/rate-limit";

const PER_IP_LIMIT = { limit: 600, windowMs: 60 * 1000 };
const PER_PUBKEY_LIMIT = { limit: 300, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "mark-messages-read:ip", PER_IP_LIMIT)) return;

  const authResult = await verifyNip98Request(req, "POST", req.body);
  if (!authResult.ok) {
    return res.status(401).json({ error: authResult.error });
  }

  if (
    !applyRateLimit(
      req,
      res,
      "mark-messages-read:pubkey",
      PER_PUBKEY_LIMIT,
      authResult.pubkey
    )
  )
    return;

  try {
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds)) {
      return res.status(400).json({ error: "messageIds must be an array" });
    }

    await markMessagesAsRead(messageIds, authResult.pubkey);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to mark messages as read:", error);
    res.status(500).json({ error: "Failed to mark messages as read" });
  }
}
