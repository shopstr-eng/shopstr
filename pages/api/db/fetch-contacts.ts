import type { NextApiRequest, NextApiResponse } from "next";
import { fetchCachedEvents } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 600, windowMs: 60 * 1000 };

/**
 * GET /api/db/fetch-contacts?pubkey=<hex>
 * Returns the most recent kind:3 contact list event cached in the DB for the given pubkey.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") return res.status(405).end();
  if (!applyRateLimit(req, res, "fetch-contacts", RATE_LIMIT)) return;

  const { pubkey } = req.query;
  if (!pubkey || typeof pubkey !== "string") {
    return res.status(400).json({ error: "pubkey required" });
  }

  try {
    const events = await fetchCachedEvents(3, { pubkey, limit: 1 });
    const event = events[0];
    if (!event) return res.status(200).json({ contactList: null });

    return res.status(200).json({
      contactList: {
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at,
        kind: event.kind,
        tags: typeof event.tags === "string" ? JSON.parse(event.tags) : event.tags,
        content: event.content,
        sig: event.sig,
      },
    });
  } catch (error) {
    console.error("Failed to fetch contact list from database:", error);
    return res.status(500).json({ error: "Failed to fetch contact list" });
  }
}
