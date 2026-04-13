import { verifyEvent } from "nostr-tools";
import {
  createSellerActionAuthEventTemplate,
  type SellerActionAuthTag,
} from "@milk-market/nostr";

const AUTH_EVENT_KIND = 27235;
const MAX_EVENT_AGE_SECONDS = 120;

export function verifyNostrAuth(
  signedEvent: any,
  expectedPubkey?: string,
  expectedAction?: SellerActionAuthTag
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

  if (expectedAction) {
    const actionTag = Array.isArray(signedEvent.tags)
      ? signedEvent.tags.find(
          (tag: unknown) =>
            Array.isArray(tag) &&
            tag[0] === "action" &&
            typeof tag[1] === "string"
        )
      : undefined;
    const actionValue = Array.isArray(actionTag) ? actionTag[1] : undefined;

    if (actionValue !== expectedAction) {
      return {
        valid: false,
        pubkey: signedEvent.pubkey,
        error: "Invalid auth action",
      };
    }
  }

  return { valid: true, pubkey: signedEvent.pubkey };
}

export function createAuthEventTemplate(
  pubkey: string,
  action: SellerActionAuthTag = "stripe-connect"
): any {
  return {
    ...createSellerActionAuthEventTemplate(pubkey, action),
    kind: AUTH_EVENT_KIND,
  };
}
