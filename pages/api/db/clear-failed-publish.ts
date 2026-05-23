import type { NextApiRequest, NextApiResponse } from "next";
import {
  clearFailedRelayPublishForOwner,
  incrementFailedRelayPublishRetryForOwner,
} from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  buildClearFailedRelayPublishProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";

const RATE_LIMIT = { limit: 300, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "clear-failed-publish", RATE_LIMIT)) return;

  try {
    const { eventId, incrementRetry } = req.body;

    if (typeof eventId !== "string") {
      return res.status(400).json({ error: "Invalid request body" });
    }

    if (incrementRetry !== undefined && typeof incrementRetry !== "boolean") {
      return res
        .status(400)
        .json({ error: "incrementRetry must be a boolean" });
    }

    const shouldIncrementRetry = incrementRetry === true;

    const signedEvent = extractSignedEventFromRequest(req);
    const verification = verifySignedHttpRequestProof(
      signedEvent,
      buildClearFailedRelayPublishProof({
        pubkey: signedEvent?.pubkey || "",
        eventId,
        incrementRetry: shouldIncrementRetry,
      })
    );

    if (!verification.ok) {
      return res
        .status(verification.status)
        .json({ error: verification.error });
    }

    if (shouldIncrementRetry) {
      await incrementFailedRelayPublishRetryForOwner(
        eventId,
        signedEvent!.pubkey
      );
    } else {
      await clearFailedRelayPublishForOwner(eventId, signedEvent!.pubkey);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error clearing failed relay publish:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
