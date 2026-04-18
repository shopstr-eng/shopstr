import type { NextApiRequest, NextApiResponse } from "next";
import {
  cachedEventsBelongToPubkey,
  deleteCachedEventsByIds,
} from "@/utils/db/db-service";
import {
  buildDeleteCachedEventsProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import { applyRateLimit, getRequestIp } from "@/utils/rate-limit";

// Bulk delete; tight per-IP and per-pubkey caps. The per-IP cap stops a single
// network source from monopolising the DB pool even before authentication; the
// per-pubkey cap prevents an authenticated identity from hammering the
// endpoint from rotating IPs.
const IP_RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };
const PUBKEY_RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "delete-events", IP_RATE_LIMIT)) return;

  try {
    const { eventIds } = req.body;
    if (
      !Array.isArray(eventIds) ||
      eventIds.some((id) => typeof id !== "string")
    ) {
      return res.status(400).json({ error: "eventIds must be a string array" });
    }

    const signedEvent = extractSignedEventFromRequest(req);
    const verification = verifySignedHttpRequestProof(
      signedEvent,
      buildDeleteCachedEventsProof({
        pubkey: signedEvent?.pubkey || "",
        eventIds,
      })
    );

    if (!verification.ok || !signedEvent) {
      return res
        .status(verification.status)
        .json({ error: verification.error });
    }

    const pubkey = signedEvent.pubkey;

    if (
      !applyRateLimit(
        req,
        res,
        "delete-events:pubkey",
        PUBKEY_RATE_LIMIT,
        `pubkey:${pubkey}`
      )
    ) {
      return;
    }

    const ownsEvents = await cachedEventsBelongToPubkey(eventIds, pubkey);
    if (!ownsEvents) {
      console.warn(
        "Rejected cached event deletion: pubkey does not own all requested ids",
        { pubkey, ip: getRequestIp(req), eventIdCount: eventIds.length }
      );
      return res.status(403).json({
        error:
          "You are not allowed to delete cached events owned by another pubkey.",
      });
    }

    await deleteCachedEventsByIds(eventIds);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to delete cached events:", error);
    res.status(500).json({ error: "Failed to delete cached events" });
  }
}
