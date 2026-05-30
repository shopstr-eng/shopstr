import type { NextApiRequest, NextApiResponse } from "next";
import { republishGiftWrapToRecipientRelays } from "@/utils/nostr/server-nostr-helpers";
import { checkRateLimit, getRequestIp } from "@/utils/rate-limit";
import { NostrEvent } from "@/utils/types/types";

// Publishes already-signed order gift-wraps (kind 1059) to the recipient
// seller's own relays from the server. The events are self-authenticating
// (verified inside the helper), so no caller auth header is required.
//
// Abuse controls (this endpoint re-broadcasts to relays + writes to the cache,
// so it must not become an open amplification/spam primitive): gift-wraps use
// a fresh random outer pubkey each time, so per-pubkey limiting is useless —
// we rely on a tight per-IP limit, a per-event-id dedupe window so the same
// event can't be replayed for amplification, and a hard per-event size cap.
const PER_IP_LIMIT = { limit: 120, windowMs: 60 * 1000 };
const PER_EVENT_LIMIT = { limit: 3, windowMs: 10 * 60 * 1000 };
const MAX_EVENTS = 10;
const MAX_EVENT_BYTES = 100_000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ipRate = checkRateLimit(
    "publish-order-event:ip",
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
    const body = req.body;
    const events: NostrEvent[] = Array.isArray(body?.events)
      ? body.events
      : body?.event
        ? [body.event]
        : Array.isArray(body)
          ? body
          : [];

    if (events.length === 0) {
      return res.status(400).json({ error: "No events provided" });
    }
    if (events.length > MAX_EVENTS) {
      return res.status(400).json({ error: "Too many events" });
    }

    const results = [];
    for (const event of events) {
      // Hard size cap — legitimate order gift-wraps are a few KB.
      if (!event || JSON.stringify(event).length > MAX_EVENT_BYTES) {
        results.push({ published: 0, relayCount: 0, skipped: "size" });
        continue;
      }
      // Per-event-id dedupe so the same event can't be replayed to amplify.
      if (typeof event.id === "string" && event.id.length > 0) {
        const eventRate = checkRateLimit(
          "publish-order-event:eid",
          event.id,
          PER_EVENT_LIMIT
        );
        if (!eventRate.ok) {
          results.push({ published: 0, relayCount: 0, skipped: "duplicate" });
          continue;
        }
      }
      const result = await republishGiftWrapToRecipientRelays(event);
      results.push({
        published: result.published,
        relayCount: result.relays.length,
      });
    }

    res.status(200).json({ success: true, results });
  } catch (error) {
    console.error("Failed to publish order event(s):", error);
    res.status(500).json({ error: "Failed to publish order event" });
  }
}
