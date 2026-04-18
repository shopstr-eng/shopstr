import type { NextApiRequest, NextApiResponse } from "next";
import { getFailedRelayPublishesForOwner } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  buildListFailedRelayPublishesProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";

// Polled by background retry loops; once-per-minute is plenty per client.
const RATE_LIMIT = { limit: 120, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "get-failed-publishes", RATE_LIMIT)) return;

  try {
    const signedEvent = extractSignedEventFromRequest(req);
    const verification = verifySignedHttpRequestProof(
      signedEvent,
      buildListFailedRelayPublishesProof(signedEvent?.pubkey || "")
    );

    if (!verification.ok) {
      return res
        .status(verification.status)
        .json({ error: verification.error });
    }

    const failedPublishes = await getFailedRelayPublishesForOwner(
      signedEvent!.pubkey
    );

    return res.status(200).json(failedPublishes);
  } catch (error) {
    console.error("Error getting failed relay publishes:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
