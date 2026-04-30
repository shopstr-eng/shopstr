import type { NextApiRequest, NextApiResponse } from "next";
import { fetchCachedEvents } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";
import { isHexPubkey } from "@/utils/nostr/pubkey";

const RATE_LIMIT = { limit: 600, windowMs: 60 * 1000 };

const normalizeTags = (tags: unknown): string[][] => {
  if (Array.isArray(tags)) {
    return tags as string[][];
  }

  if (typeof tags !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? (parsed as string[][]) : [];
  } catch {
    return [];
  }
};

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
  if (!isHexPubkey(pubkey)) {
    return res.status(400).json({ error: "invalid pubkey" });
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
        tags: normalizeTags(event.tags),
        content: event.content,
        sig: event.sig,
      },
    });
  } catch (error) {
    console.error("Failed to fetch contact list from database:", error);
    return res.status(500).json({ error: "Failed to fetch contact list" });
  }
}
