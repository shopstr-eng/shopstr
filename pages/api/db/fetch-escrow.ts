import type { NextApiRequest, NextApiResponse } from "next";
import { fetchCachedEvents } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 600, windowMs: 60 * 1000 };
const HEX_PUBKEY_REGEX = /^[0-9a-f]{64}$/;

// Returns the buyer's kind-30406 escrow records (cached Nostr events) for a
// pubkey. The event content is NIP-44-encrypted to the owner, so the payment
// token stays unreadable without the owner's private key — this endpoint only
// exposes the same ciphertext + metadata that already lives on public relays.
// It is rate-limited as a coarse abuse guard.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "fetch-escrow", RATE_LIMIT)) return;

  try {
    const { pubkey } = req.query;
    if (typeof pubkey !== "string") {
      return res.status(400).json({ error: "Invalid pubkey parameter" });
    }

    const normalizedPubkey = pubkey.trim().toLowerCase();
    if (!HEX_PUBKEY_REGEX.test(normalizedPubkey)) {
      return res.status(400).json({ error: "Invalid pubkey parameter" });
    }

    const escrowEvents = await fetchCachedEvents(30406, {
      pubkey: normalizedPubkey,
    });
    res.status(200).json(escrowEvents);
  } catch (error) {
    console.error("Failed to fetch escrow records from database:", error);
    res.status(500).json({ error: "Failed to fetch escrow records" });
  }
}
