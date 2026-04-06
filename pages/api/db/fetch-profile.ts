import type { NextApiRequest, NextApiResponse } from "next";
import { fetchCachedEvents } from "@/utils/db/db-service";

/**
 * GET /api/db/fetch-profile?pubkey=<hex>
 * Returns the most recent kind:0 profile cached in the DB for the given pubkey.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") return res.status(405).end();
  const { pubkey } = req.query;
  if (!pubkey || typeof pubkey !== "string")
    return res.status(400).json({ error: "pubkey required" });
  try {
    const events = await fetchCachedEvents(0, { pubkey, limit: 1 });
    const event = events[0];
    if (!event) return res.status(200).json({ profile: null });
    let content: Record<string, any> = {};
    try { content = JSON.parse(event.content); } catch { return res.status(200).json({ profile: null }); }
    return res.status(200).json({ profile: { pubkey: event.pubkey, content, created_at: event.created_at } });
  } catch (error) {
    console.error("Failed to fetch profile:", error);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
}
