import { NextApiRequest, NextApiResponse } from "next";
import {
  saveNotificationEmail,
  getSellerNotificationEmail,
  getUserAuthEmail,
} from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    const { pubkey, role } = req.query;

    if (!pubkey || typeof pubkey !== "string") {
      return res.status(400).json({ error: "pubkey is required" });
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
      return res
        .status(500)
        .json({ error: "Failed to fetch notification email" });
    }
  }

  if (req.method === "POST") {
    const { email, role, pubkey, orderId } = req.body;

    if (!email || !role) {
      return res.status(400).json({ error: "email and role are required" });
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
