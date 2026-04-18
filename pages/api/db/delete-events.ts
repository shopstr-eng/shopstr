import type { NextApiRequest, NextApiResponse } from "next";
import {
  deleteCachedEventsByIds,
  getCachedEventPubkeys,
} from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  buildDeleteEventsProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";

// Bulk delete; tight per-IP cap.
const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

function normalizeEventIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.trim())
      .filter(Boolean)
  )]
    .filter(Boolean)
    .sort();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "delete-events", RATE_LIMIT)) return;

  try {
    const eventIds = normalizeEventIds(req.body?.eventIds);
    const signedEvent = extractSignedEventFromRequest(req);
    const actorPubkey = signedEvent?.pubkey || "";

    if (eventIds.length === 0) {
      return res.status(400).json({ error: "eventIds must be a non-empty array" });
    }

    const verification = verifySignedHttpRequestProof(
      signedEvent,
      buildDeleteEventsProof({
        pubkey: actorPubkey,
        eventIds,
      })
    );

    if (!verification.ok) {
      return res.status(verification.status).json({ error: verification.error });
    }

    const cachedEventPubkeys = await getCachedEventPubkeys(eventIds);
    const hasForeignEvent = Array.from(cachedEventPubkeys.values()).some(
      (pubkey) => pubkey !== actorPubkey
    );

    if (hasForeignEvent) {
      return res.status(403).json({
        error: "You may only delete cached events that belong to your pubkey.",
      });
    }

    await deleteCachedEventsByIds(eventIds);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to delete cached events:", error);
    res.status(500).json({ error: "Failed to delete cached events" });
  }
}
