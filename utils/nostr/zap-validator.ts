import { NostrManager } from "./nostr-manager";

export async function validateZapReceipt(
  nostr: NostrManager,
  productId: string,
  minTimestamp: number
): Promise<boolean> {
  const filter = {
    kinds: [9735],
    "#e": [productId],
    since: minTimestamp,
  };

  const maxRetries = 5;
  const delay = 1000;

  for (let i = 0; i < maxRetries; i++) {
    const events = await nostr.fetch([filter]);
    if (events.length > 0) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return false;
}
