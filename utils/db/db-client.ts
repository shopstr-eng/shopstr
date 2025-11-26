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
