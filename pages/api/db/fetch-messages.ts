import type { NextApiRequest, NextApiResponse } from "next";
import { fetchAllMessagesFromDb } from "@/utils/db/db-service";
import {
  buildMessagesListProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import { applyRateLimit } from "@/utils/rate-limit";

// Polled by the messages dashboard during active conversations; per-IP cap
// is high enough to cover normal use while bounding a single client.
const RATE_LIMIT = { limit: 600, windowMs: 60 * 1000 };
const HEX_PUBKEY_REGEX = /^[0-9a-f]{64}$/;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "fetch-messages", RATE_LIMIT)) return;

  try {
    const { pubkey } = req.query;
    if (typeof pubkey !== "string") {
      return res.status(400).json({ error: "Invalid pubkey parameter" });
    }

    const normalizedPubkey = pubkey.trim().toLowerCase();
    if (!HEX_PUBKEY_REGEX.test(normalizedPubkey)) {
      return res.status(400).json({ error: "Invalid pubkey parameter" });
    }

    const signedEvent = extractSignedEventFromRequest(req);
    const verification = verifySignedHttpRequestProof(
      signedEvent,
      buildMessagesListProof(normalizedPubkey)
    );

    if (!verification.ok) {
      return res
        .status(verification.status)
        .json({ error: verification.error });
    }

    const messages = await fetchAllMessagesFromDb(normalizedPubkey);
    res.status(200).json(messages);
  } catch (error) {
    console.error("Failed to fetch messages from database:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
}
