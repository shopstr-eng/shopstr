import { NostrEvent } from "@/utils/types/types";

export async function cacheEventToDatabase(event: NostrEvent): Promise<void> {
  try {
    const response = await fetch("/api/db/cache-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      throw new Error("Failed to cache event to database");
    }
  } catch (error) {
    console.error("Failed to cache event to database:", error);
    throw error;
  }
}

export async function cacheEventsToDatabase(
  events: NostrEvent[]
): Promise<void> {
  try {
    const response = await fetch("/api/db/cache-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(events),
    });
    if (!response.ok) {
      throw new Error("Failed to cache events to database");
    }
  } catch (error) {
    console.error("Failed to cache events to database:", error);
    throw error;
  }
}

export async function deleteEventsFromDatabase(
  eventIds: string[]
): Promise<void> {
  if (eventIds.length === 0) return;

  try {
    await fetch("/api/db/delete-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventIds }),
    });
  } catch (error) {
    console.error("Failed to delete events from database:", error);
  }
}

export async function trackFailedRelayPublish(
  eventId: string,
  event: NostrEvent,
  relays: string[]
): Promise<void> {
  try {
    await fetch("/api/db/track-failed-publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, event, relays }),
    });
  } catch (error) {
    console.error("Failed to track failed relay publish:", error);
  }
}

export async function getFailedRelayPublishes(): Promise<
  Array<{
    eventId: string;
    relays: string[];
    event: NostrEvent;
    retryCount: number;
  }>
> {
  try {
    const response = await fetch("/api/db/get-failed-publishes");
    if (!response.ok) {
      throw new Error("Failed to fetch failed relay publishes");
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to get failed relay publishes:", error);
    return [];
  }
}

export async function clearFailedRelayPublish(eventId: string): Promise<void> {
  try {
    await fetch("/api/db/clear-failed-publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    });
  } catch (error) {
    console.error("Failed to clear failed relay publish:", error);
  }
}
