import type { NextApiRequest, NextApiResponse } from "next";
import { type Event, verifyEvent } from "nostr-tools";
import { cacheEvent } from "@/utils/db/db-service";
import { isCacheableEventShape } from "@/utils/db/cache-event-policy";
import { checkRateLimit, getRequestIp } from "@/utils/rate-limit";
import { NostrEvent } from "@/utils/types/types";

// Cache writes are a best-effort mirror of relay publishes; they carry
// order/payment/message gift-wraps during peak checkout load. Limits are
// primarily per-pubkey (the body's pubkey is verified below before any DB
// write) so shared-NAT traffic from many buyers does not throttle each other.
// A coarse per-IP backstop still bounds memory/abuse from pubkey rotation.
const PER_PUBKEY_LIMIT = { limit: 600, windowMs: 60 * 1000 };
const PER_IP_LIMIT = { limit: 2000, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ipRate = checkRateLimit(
    "cache-event:ip",
    getRequestIp(req),
    PER_IP_LIMIT
  );
  if (!ipRate.ok) {
    res.setHeader(
      "Retry-After",
      Math.max(1, Math.ceil((ipRate.resetAt - Date.now()) / 1000))
    );
    return res.status(429).json({ error: "Too many requests" });
  }

  try {
    const event: NostrEvent = req.body;
    if (!isCacheableEventShape(event)) {
      return res
        .status(400)
        .json({ error: "Event kind is not permitted for caching" });
    }

    const pubkeyRate = checkRateLimit(
      "cache-event:pubkey",
      event.pubkey,
      PER_PUBKEY_LIMIT
    );
    if (!pubkeyRate.ok) {
      res.setHeader(
        "Retry-After",
        Math.max(1, Math.ceil((pubkeyRate.resetAt - Date.now()) / 1000))
      );
      return res.status(429).json({ error: "Too many requests" });
    }

    if (!verifyEvent(event as Event)) {
      return res.status(401).json({ error: "Invalid or unsigned Nostr event" });
    }
    await cacheEvent(event);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Failed to cache event:", error);
    res.status(500).json({ error: "Failed to cache event" });
  }
}
