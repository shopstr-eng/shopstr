import type { NextApiRequest, NextApiResponse } from "next";
import { fetchCachedEvents } from "@/utils/db/db-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { pubkey } = req.query;
    if (typeof pubkey !== "string") {
      return res.status(400).json({ error: "Invalid pubkey parameter" });
    }

    const walletEvents = await fetchCachedEvents(null as any, { pubkey });
    res.status(200).json(walletEvents);
  } catch (error) {
    console.error("Failed to fetch wallet events from database:", error);
    res.status(500).json({ error: "Failed to fetch wallet events" });
  }
}
