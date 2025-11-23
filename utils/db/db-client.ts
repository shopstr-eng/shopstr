
import { NostrEvent } from "@/utils/types/types";

export async function cacheEventToDatabase(event: NostrEvent): Promise<void> {
  try {
    await fetch("/api/db/cache-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch (error) {
    console.error("Failed to cache event to database:", error);
  }
}

export async function cacheEventsToDatabase(events: NostrEvent[]): Promise<void> {
  if (events.length === 0) return;
  
  try {
    await fetch("/api/db/cache-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(events),
    });
  } catch (error) {
    console.error("Failed to cache events to database:", error);
  }
}

export async function deleteEventsFromDatabase(eventIds: string[]): Promise<void> {
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
