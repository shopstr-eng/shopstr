import { verifyEvent } from "nostr-tools";

const AUTH_EVENT_KIND = 27235;
const MAX_EVENT_AGE_SECONDS = 120;

export function verifyNostrAuth(
  signedEvent: any,
  expectedPubkey?: string
): { valid: boolean; pubkey: string; error?: string } {
  if (!signedEvent || typeof signedEvent !== "object") {
    return { valid: false, pubkey: "", error: "Missing signed auth event" };
  }

  if (signedEvent.kind !== AUTH_EVENT_KIND) {
    return { valid: false, pubkey: "", error: "Invalid auth event kind" };
  }

  if (!verifyEvent(signedEvent)) {
    return { valid: false, pubkey: "", error: "Invalid event signature" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - signedEvent.created_at) > MAX_EVENT_AGE_SECONDS) {
    return { valid: false, pubkey: "", error: "Auth event has expired" };
  }

  if (expectedPubkey && signedEvent.pubkey !== expectedPubkey) {
    return {
      valid: false,
      pubkey: signedEvent.pubkey,
      error: "Pubkey mismatch",
    };
  }

  return { valid: true, pubkey: signedEvent.pubkey };
}

export function createAuthEventTemplate(pubkey: string): any {
  return {
    kind: AUTH_EVENT_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["action", "stripe-connect"]],
    content: "Authorize Stripe Connect account management",
    pubkey,
  };
}
