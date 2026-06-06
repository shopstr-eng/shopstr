import { NostrEvent } from "@/utils/types/types";
import {
  buildClearFailedRelayPublishProof,
  buildListFailedRelayPublishesProof,
  buildSignedHttpRequestProofTemplate,
  buildTrackFailedRelayPublishProof,
  SIGNED_EVENT_HEADER,
} from "@/utils/nostr/request-auth";

type RequestProofSigner = {
  getPubKey: () => string | Promise<string>;
  sign: (event: any) => NostrEvent | Promise<NostrEvent>;
};

async function buildSignedRequestHeader(
  signer: RequestProofSigner,
  proof:
    | ReturnType<typeof buildTrackFailedRelayPublishProof>
    | ReturnType<typeof buildListFailedRelayPublishesProof>
    | ReturnType<typeof buildClearFailedRelayPublishProof>
) {
  const signedEvent = await Promise.resolve(
    signer.sign(buildSignedHttpRequestProofTemplate(proof))
  );

  return {
    [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
  };
}

export async function cacheEventToDatabase(event: NostrEvent): Promise<void> {
  // Bound the request so a hung DB endpoint can't freeze publish flows
  // (e.g. listing create/edit, gift-wraps, deletes) indefinitely.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("/api/db/cache-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error("Failed to cache event to database");
    }
  } catch (error) {
    console.error("Failed to cache event to database:", error);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Ask the server to publish already-signed order gift-wraps to the recipient
// seller's own relays. Primary, origin/login-independent delivery path that
// fixes custom-domain orders. Relative URL so it works on custom domains too;
// keepalive so it still completes if the page navigates after checkout.
// Non-fatal: failures must never block the payment flow.
export async function deliverOrderEventsServerSide(
  events: NostrEvent[]
): Promise<void> {
  if (!events || events.length === 0) return;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("/api/nostr/publish-order-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      signal: controller.signal,
      keepalive: true,
    });
    if (!response.ok) {
      console.warn("Server-side order delivery responded with an error");
    }
  } catch (error) {
    console.warn("Server-side order delivery failed (non-fatal):", error);
  } finally {
    clearTimeout(timeoutId);
  }
}

const CACHE_EVENTS_CHUNK_SIZE = 50;

export async function cacheEventsToDatabase(
  events: NostrEvent[]
): Promise<void> {
  try {
    const chunks: NostrEvent[][] = [];
    for (let i = 0; i < events.length; i += CACHE_EVENTS_CHUNK_SIZE) {
      chunks.push(events.slice(i, i + CACHE_EVENTS_CHUNK_SIZE));
    }
    for (const chunk of chunks) {
      const response = await fetch("/api/db/cache-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
      if (!response.ok) {
        console.error("Failed to cache events to database");
      }
    }
  } catch (error) {
    console.error("Failed to cache events to database:", error);
  }
}

export async function deleteEventsFromDatabase(
  eventIds: string[],
  signedEvent: NostrEvent
): Promise<void> {
  if (eventIds.length === 0) return;

  try {
    await fetch("/api/db/delete-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
      },
      body: JSON.stringify({ eventIds }),
    });
  } catch (error) {
    console.error("Failed to delete events from database:", error);
  }
}

export async function trackFailedRelayPublish(
  eventId: string,
  event: NostrEvent,
  relays: string[],
  signer?: RequestProofSigner
): Promise<void> {
  // Bound this so a hung tracking endpoint or a stuck NIP-46 sign request
  // can't keep the publish UI spinning after a relay timeout.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    if (!signer) {
      console.warn("Skipping failed relay publish tracking without signer");
      return;
    }

    const pubkey = await Promise.resolve(signer.getPubKey());
    const signedHeaders = await buildSignedRequestHeader(
      signer,
      buildTrackFailedRelayPublishProof({
        pubkey,
        eventId,
      })
    );
    await fetch("/api/db/track-failed-publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...signedHeaders,
      },
      body: JSON.stringify({ eventId, event, relays }),
      signal: controller.signal,
    });
  } catch (error) {
    console.error("Failed to track failed relay publish:", error);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getFailedRelayPublishes(
  signer?: RequestProofSigner
): Promise<
  Array<{
    eventId: string;
    relays: string[];
    event: NostrEvent;
    retryCount: number;
  }>
> {
  try {
    if (!signer) {
      return [];
    }

    const pubkey = await Promise.resolve(signer.getPubKey());
    const signedHeaders = await buildSignedRequestHeader(
      signer,
      buildListFailedRelayPublishesProof(pubkey)
    );
    const response = await fetch("/api/db/get-failed-publishes", {
      headers: signedHeaders,
    });
    if (!response.ok) {
      console.error("Failed to fetch failed relay publishes");
      return [];
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to get failed relay publishes:", error);
    return [];
  }
}

export async function clearFailedRelayPublish(
  eventId: string,
  signer?: RequestProofSigner,
  incrementRetry = false
): Promise<void> {
  try {
    if (!signer) {
      return;
    }

    const pubkey = await Promise.resolve(signer.getPubKey());
    const signedHeaders = await buildSignedRequestHeader(
      signer,
      buildClearFailedRelayPublishProof({
        pubkey,
        eventId,
        incrementRetry,
      })
    );
    await fetch("/api/db/clear-failed-publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...signedHeaders,
      },
      body: JSON.stringify({ eventId, incrementRetry }),
    });
  } catch (error) {
    console.error("Failed to clear failed relay publish:", error);
  }
}
