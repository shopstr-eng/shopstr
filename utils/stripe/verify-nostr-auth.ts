import { verifyEvent } from "nostr-tools";
import {
  buildSellerActionAuthBindingTags,
  createSellerActionAuthEventTemplate,
  type SellerActionAuthBinding,
  type SellerActionAuthTag,
} from "@milk-market/nostr";

const AUTH_EVENT_KIND = 27235;
const MAX_EVENT_AGE_SECONDS = 120;

function tagsContain(eventTags: unknown, expected: string[]): boolean {
  if (!Array.isArray(eventTags)) return false;
  return eventTags.some(
    (tag) =>
      Array.isArray(tag) &&
      tag.length >= expected.length &&
      expected.every((value, idx) => tag[idx] === value)
  );
}

export function verifyNostrAuth(
  signedEvent: any,
  expectedPubkey?: string,
  expectedAction?: SellerActionAuthTag,
  expectedBinding?: SellerActionAuthBinding
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

  if (expectedBinding) {
    const expectedTags = buildSellerActionAuthBindingTags(expectedBinding);
    for (const expected of expectedTags) {
      if (!tagsContain(signedEvent.tags, expected)) {
        return {
          valid: false,
          pubkey: signedEvent.pubkey,
          error: "Auth event does not match this request",
        };
      }
    }
  }

  return { valid: true, pubkey: signedEvent.pubkey };
}

export function createAuthEventTemplate(
  pubkey: string,
  action: SellerActionAuthTag = "stripe-connect",
  binding?: SellerActionAuthBinding
): any {
  return {
    ...createSellerActionAuthEventTemplate(pubkey, action, binding),
    kind: AUTH_EVENT_KIND,
  };
}
