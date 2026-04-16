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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { eventIds } = req.body;
    if (!Array.isArray(eventIds) || eventIds.some((id) => typeof id !== "string")) {
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

    if (!verification.ok) {
      return res.status(verification.status).json({ error: verification.error });
    }

    const ownsEvents = await cachedEventsBelongToPubkey(
      eventIds,
      signedEvent!.pubkey
    );
    if (!ownsEvents) {
      return res.status(403).json({
        error: "You are not allowed to delete cached events owned by another pubkey.",
      });
    }

    await deleteCachedEventsByIds(eventIds);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to delete cached events:", error);
    res.status(500).json({ error: "Failed to delete cached events" });
  }
}
