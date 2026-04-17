import { NextApiRequest, NextApiResponse } from "next";
import { sendInquiryNotification } from "@/utils/email/email-service";
import {
  getSellerNotificationEmail,
  getUserAuthEmail,
} from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 20, windowMs: 60 * 1000 };

async function getEmailForPubkey(pubkey: string): Promise<string | null> {
  let email = await getSellerNotificationEmail(pubkey);
  if (!email) {
    email = await getUserAuthEmail(pubkey);
  }
  return email;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "email-send-inquiry", RATE_LIMIT)) return;

  const { senderPubkey, recipientPubkey, message, senderName } = req.body;

  if (!senderPubkey || !recipientPubkey || !message) {
    return res.status(400).json({
      error: "senderPubkey, recipientPubkey, and message are required",
    });
  }

  try {
    const [senderEmail, recipientEmail] = await Promise.all([
      getEmailForPubkey(senderPubkey),
      getEmailForPubkey(recipientPubkey),
    ]);

    if (!senderEmail && !recipientEmail) {
      return res.status(200).json({
        success: true,
        emailsSent: 0,
        reason: "Neither party has an email on file",
      });
    }

    const displayName = senderName || `User ${senderPubkey.slice(0, 8)}...`;
    let emailsSent = 0;

    if (recipientEmail) {
      const sent = await sendInquiryNotification(recipientEmail, {
        senderName: displayName,
        message,
        senderHasEmail: !!senderEmail,
        senderEmail: senderEmail || undefined,
      });
      if (sent) emailsSent++;
    }

    return res.status(200).json({ success: true, emailsSent });
  } catch (error) {
    console.error("Error sending inquiry email:", error);
    return res.status(500).json({ error: "Failed to send inquiry email" });
  }
}
