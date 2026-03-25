import type { NextApiRequest, NextApiResponse } from "next";
import { markDiscountCodeUsed } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code, pubkey } = req.body;

  if (!code || !pubkey) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await markDiscountCodeUsed(code, pubkey);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to mark discount code used:", error);
    return res.status(500).json({ error: "Failed to update" });
  }
}
