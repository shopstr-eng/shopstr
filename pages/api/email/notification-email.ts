import { NextApiRequest, NextApiResponse } from "next";
import { saveNotificationEmail } from "@/utils/db/db-service";
import { verifyNostrAuth } from "@/utils/stripe/verify-nostr-auth";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!applyRateLimit(req, res, "email-notification", RATE_LIMIT)) return;

  if (req.method === "POST") {
    const { email, role, pubkey, orderId, signedEvent } = req.body;

    if (
      typeof email !== "string" ||
      (role !== "buyer" && role !== "seller") ||
      typeof pubkey !== "string" ||
      !signedEvent
    ) {
      return res
        .status(400)
        .json({ error: "email, role, pubkey, and signedEvent are required" });
    }

    const authResult = verifyNostrAuth(
      signedEvent,
      pubkey,
      "notification-email-write"
    );
    if (!authResult.valid) {
      return res
        .status(401)
        .json({ error: authResult.error || "Authentication failed" });
    }

    try {
      await saveNotificationEmail(email, role, pubkey, orderId);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error saving notification email:", error);
      return res
        .status(500)
        .json({ error: "Failed to save notification email" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
