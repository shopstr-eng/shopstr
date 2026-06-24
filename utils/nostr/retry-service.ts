import { NostrManager } from "./nostr-manager";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import {
  getFailedRelayPublishes,
  clearFailedRelayPublish,
} from "@/utils/db/db-client";
import { newPromiseWithTimeout } from "@/utils/timeout";

export async function retryFailedRelayPublishes(
  nostr: NostrManager,
  signer?: NostrSigner
): Promise<void> {
  try {
    if (!signer) {
      return;
    }

    const failedPublishes = await getFailedRelayPublishes(signer);

    if (failedPublishes.length === 0) {
      return;
    }

    for (const { eventId, relays, event, retryCount } of failedPublishes) {
      try {
        // Exponential backoff delay based on retry count
        const delayMs = Math.min(1000 * Math.pow(2, retryCount), 30000);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // Attempt to publish with timeout
        await newPromiseWithTimeout(
          async (resolve, reject) => {
            try {
              await nostr.publish(event, relays);
              resolve(undefined);
            } catch (err) {
              reject(err as Error);
            }
          },
          { timeout: 21000 }
        );

        // Success - clear the failed publish record
        await clearFailedRelayPublish(eventId, signer);
      } catch (error) {
        // Still failed - increment retry count
        console.warn(`Retry failed for event ${eventId}:`, error);
        await clearFailedRelayPublish(eventId, signer, true);
      }
    }
  } catch (error) {
    console.error("Error in retry service:", error);
  }
}
