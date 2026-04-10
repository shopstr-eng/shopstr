import { NextApiRequest, NextApiResponse } from "next";
import {
  getSellerNotificationEmail,
  getUserAuthEmail,
} from "@/utils/db/db-service";
import { verifyNostrAuth } from "@/utils/stripe/verify-nostr-auth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { pubkey, role, signedEvent } = req.body;

  if (typeof pubkey !== "string" || !signedEvent) {
    return res
      .status(400)
      .json({ error: "pubkey and signedEvent are required" });
  }

  const authResult = verifyNostrAuth(
    signedEvent,
    pubkey,
    "notification-email-read"
  );
  if (!authResult.valid) {
    return res
      .status(401)
      .json({ error: authResult.error || "Authentication failed" });
  }

  try {
    let email: string | null = null;

    if (role === "seller") {
      email = await getSellerNotificationEmail(pubkey);
    }

    if (!email) {
      email = await getUserAuthEmail(pubkey);
    }

    return res.status(200).json({ email });
  } catch (error) {
    console.error("Error fetching notification email:", error);
    return res.status(500).json({ error: "Failed to fetch notification email" });
  }
}
