import type { NextApiRequest, NextApiResponse } from "next";
import { verifyEvent } from "nostr-tools";
import { fetchCachedEvents } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  DISPUTE_EVENT_KIND,
  isDisputeTransitionAuthorAuthorized,
} from "@/utils/nostr/dispute-records";

const RATE_LIMIT = { limit: 600, windowMs: 60 * 1000 };
const HEX_PUBKEY_REGEX = /^[0-9a-f]{64}$/;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "fetch-disputes", RATE_LIMIT)) return;

  try {
    const { arbiterPubkey } = req.query;
    if (typeof arbiterPubkey !== "string") {
      return res.status(400).json({ error: "Invalid arbiter pubkey" });
    }

    const normalizedArbiterPubkey = arbiterPubkey.trim().toLowerCase();
    if (!HEX_PUBKEY_REGEX.test(normalizedArbiterPubkey)) {
      return res.status(400).json({ error: "Invalid arbiter pubkey" });
    }

    const events = await fetchCachedEvents(DISPUTE_EVENT_KIND, { limit: 100 });
    const disputes = events.filter(
      (event) =>
        verifyEvent(event) &&
        isDisputeTransitionAuthorAuthorized(event, normalizedArbiterPubkey)
    );
    res.status(200).json(disputes);
  } catch (error) {
    console.error("Failed to fetch disputes from database:", error);
    res.status(500).json({ error: "Failed to fetch disputes" });
  }
}
