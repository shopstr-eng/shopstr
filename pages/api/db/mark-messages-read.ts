import type { NextApiRequest, NextApiResponse } from "next";
import { markMessagesAsRead } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds)) {
      return res.status(400).json({ error: "messageIds must be an array" });
    }

    await markMessagesAsRead(messageIds);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to mark messages as read:", error);
    res.status(500).json({ error: "Failed to mark messages as read" });
  }
}
