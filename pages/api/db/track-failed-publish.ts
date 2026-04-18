import type { NextApiRequest, NextApiResponse } from "next";
import { trackFailedRelayPublishRecord } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";
import { verifyEvent } from "nostr-tools";
import {
  buildTrackFailedRelayPublishProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";

// Spikes during relay outages while a client retries every failed publish;
// generous enough to absorb that, bounded enough to stop a runaway loop.
const RATE_LIMIT = { limit: 300, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "track-failed-publish", RATE_LIMIT)) return;

  try {
    const { eventId, event, relays } = req.body;

    if (
      !eventId ||
      !event ||
      !relays ||
      !Array.isArray(relays) ||
      relays.some((relay) => typeof relay !== "string")
    ) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    if (typeof eventId !== "string") {
      return res.status(400).json({ error: "eventId must be a string" });
    }

    const signedEvent = extractSignedEventFromRequest(req);
    const verification = verifySignedHttpRequestProof(
      signedEvent,
      buildTrackFailedRelayPublishProof({
        pubkey: signedEvent?.pubkey || "",
        eventId,
      })
    );

    if (!verification.ok) {
      return res
        .status(verification.status)
        .json({ error: verification.error });
    }

    if (event.id !== eventId) {
      return res
        .status(400)
        .json({ error: "eventId must match the supplied event id" });
    }

    if (!verifyEvent(event)) {
      return res.status(400).json({ error: "Invalid Nostr event signature" });
    }

    const tracked = await trackFailedRelayPublishRecord({
      eventId,
      ownerPubkey: signedEvent!.pubkey,
      event,
      relays,
    });

    if (!tracked) {
      return res.status(403).json({
        error: "This failed publish entry already belongs to another pubkey.",
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error tracking failed relay publish:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
