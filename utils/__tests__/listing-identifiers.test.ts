import { nip19 } from "nostr-tools";

import {
  eventMatchesListingIdentifier,
  getListingRouteIdentifier,
} from "../listing-identifiers";
import { NostrEvent } from "../types/types";

const baseEvent: NostrEvent = {
  id: "event-id-123",
  pubkey: "1".repeat(64),
  created_at: 1710000000,
  kind: 30402,
  tags: [
    ["d", "listing-d-tag"],
    ["title", "Relay Hint Listing"],
  ],
  content: "",
  sig: "f".repeat(128),
};

describe("listing-identifiers", () => {
  test("normalizes route params from catch-all arrays", () => {
    expect(getListingRouteIdentifier(["primary-id", "ignored-id"])).toBe(
      "primary-id"
    );
    expect(getListingRouteIdentifier("single-id")).toBe("single-id");
    expect(getListingRouteIdentifier(undefined)).toBe("");
  });

  test("matches a relay-hinted naddr against the same listing identity", () => {
    const relayHintedNaddr = nip19.naddrEncode({
      identifier: "listing-d-tag",
      pubkey: baseEvent.pubkey,
      kind: baseEvent.kind,
      relays: ["wss://relay.shopstr.example", "wss://relay-2.shopstr.example"],
    });

    expect(eventMatchesListingIdentifier(baseEvent, relayHintedNaddr)).toBe(
      true
    );
  });

  test("matches a canonical naddr without relay hints", () => {
    const naddr = nip19.naddrEncode({
      identifier: "listing-d-tag",
      pubkey: baseEvent.pubkey,
      kind: baseEvent.kind,
    });

    expect(eventMatchesListingIdentifier(baseEvent, naddr)).toBe(true);
  });

  test("returns false when the decoded naddr identity does not fully match", () => {
    const wrongPubkeyNaddr = nip19.naddrEncode({
      identifier: "listing-d-tag",
      pubkey: "2".repeat(64),
      kind: baseEvent.kind,
      relays: ["wss://relay.shopstr.example"],
    });
    const wrongKindNaddr = nip19.naddrEncode({
      identifier: "listing-d-tag",
      pubkey: baseEvent.pubkey,
      kind: 30403,
    });
    const wrongIdentifierNaddr = nip19.naddrEncode({
      identifier: "other-d-tag",
      pubkey: baseEvent.pubkey,
      kind: baseEvent.kind,
    });

    expect(eventMatchesListingIdentifier(baseEvent, wrongPubkeyNaddr)).toBe(
      false
    );
    expect(eventMatchesListingIdentifier(baseEvent, wrongKindNaddr)).toBe(
      false
    );
    expect(eventMatchesListingIdentifier(baseEvent, wrongIdentifierNaddr)).toBe(
      false
    );
  });

  test("returns false for malformed naddr identifiers without throwing", () => {
    expect(eventMatchesListingIdentifier(baseEvent, "naddr1definitelyinvalid")).toBe(
      false
    );
  });

  test("still matches direct event ids and d tags", () => {
    expect(eventMatchesListingIdentifier(baseEvent, baseEvent.id)).toBe(true);
    expect(eventMatchesListingIdentifier(baseEvent, "listing-d-tag")).toBe(
      true
    );
  });
});
