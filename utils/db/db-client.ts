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
  try {
    const response = await fetch("/api/db/cache-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      console.error("Failed to cache event to database");
    }
  } catch (error) {
    console.error("Failed to cache event to database:", error);
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
    });
  } catch (error) {
    console.error("Failed to track failed relay publish:", error);
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
