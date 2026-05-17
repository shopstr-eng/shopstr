import { NostrEvent } from "nostr-tools";
import { parseCommunityEvent } from "../community-parser-functions";

describe("parseCommunityEvent", () => {
  const baseEvent: NostrEvent = {
    id: "test-id",
    kind: 34550,
    pubkey: "creator-pubkey",
    created_at: 1620000000,
    tags: [["d", "test-community"]],
    content: "",
    sig: "test-sig",
  };

  it("should return null if the event kind is not 34550", () => {
    const event = { ...baseEvent, kind: 1 };
    expect(parseCommunityEvent(event)).toBeNull();
  });

  it("should return null if the event is missing a 'd' tag", () => {
    const event = { ...baseEvent, tags: [] };
    expect(parseCommunityEvent(event)).toBeNull();
  });

  it("should parse a minimal event and use fallback values", () => {
    const result = parseCommunityEvent(baseEvent);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("test-community");
    expect(result?.description).toBe("");
    expect(result?.image).toBe("https://robohash.org/test-id");
    expect(result?.moderators).toEqual(["creator-pubkey"]);
    expect(result?.relays.all).toEqual([]);
    expect(result?.relaysList).toBeUndefined();
  });

  it("should parse a complete community event with all tags", () => {
    const fullEvent: NostrEvent = {
      ...baseEvent,
      tags: [
        ["d", "tech-enthusiasts"],
        ["name", "Tech Enthusiasts"],
        ["description", "A community for tech lovers."],
        ["image", "https://example.com/image.png"],
        ["p", "mod-pubkey-1", "", "moderator"],
        ["p", "mod-pubkey-2"],
        ["p", "creator-pubkey"],
        ["relay", "wss://relay.one", "approvals"],
        ["relay", "wss://relay.two", "requests"],
        ["relay", "wss://relay.three", "metadata"],
        ["relay", "wss://relay.four"],
        ["relay", "wss://relay.one"],
      ],
    };

    const result = parseCommunityEvent(fullEvent);
    expect(result).not.toBeNull();
    expect(result?.d).toBe("tech-enthusiasts");
    expect(result?.name).toBe("Tech Enthusiasts");
    expect(result?.description).toBe("A community for tech lovers.");
    expect(result?.image).toBe("https://example.com/image.png");

    expect(result?.moderators).toEqual(
      expect.arrayContaining(["creator-pubkey", "mod-pubkey-1", "mod-pubkey-2"])
    );
    expect(result?.moderators.length).toBe(3);

    expect(result?.relays.approvals).toEqual(["wss://relay.one"]);
    expect(result?.relays.requests).toEqual(
      expect.arrayContaining([
        "wss://relay.two",
        "wss://relay.four",
        "wss://relay.one",
      ])
    );
    expect(result?.relays.requests.length).toBe(3);
    expect(result?.relays.metadata).toEqual(["wss://relay.three"]);
    expect(result?.relays.all).toEqual(
      expect.arrayContaining([
        "wss://relay.one",
        "wss://relay.two",
        "wss://relay.three",
        "wss://relay.four",
      ])
    );
    expect(result?.relays.all.length).toBe(4);
    expect(result?.relaysList).toEqual(result?.relays.all);
  });

  it("should handle duplicate relay and moderator tags gracefully", () => {
    const eventWithDuplicates: NostrEvent = {
      ...baseEvent,
      tags: [
        ["d", "duplicate-test"],
        ["p", "mod-1", "", "moderator"],
        ["p", "mod-1", "", "moderator"], // Duplicate moderator
        ["relay", "wss://relay.one", "approvals"],
        ["relay", "wss://relay.one", "approvals"], // Duplicate approval relay
        ["relay", "wss://relay.two"],
        ["relay", "wss://relay.two"], // Duplicate request relay
      ],
    };

    const result = parseCommunityEvent(eventWithDuplicates);
    expect(result).not.toBeNull();

    expect(result?.moderators).toEqual(["creator-pubkey", "mod-1"]);

    expect(result?.relays.approvals).toEqual(["wss://relay.one"]);
    expect(result?.relays.requests).toEqual(["wss://relay.two"]);
    expect(result?.relays.all).toEqual(
      expect.arrayContaining(["wss://relay.one", "wss://relay.two"])
    );
    expect(result?.relays.all.length).toBe(2);
  });

  it("should handle edge cases like empty or invalid tags gracefully", () => {
    const edgeCaseEvent: NostrEvent = {
      ...baseEvent,
      tags: [
        ["d", "edge-case-community"],
        ["p", ""],
        ["relay", ""],
        ["relay", "wss://valid.relay", "REQUESTS"],
      ],
    };

    const result = parseCommunityEvent(edgeCaseEvent);
    expect(result).not.toBeNull();
    expect(result?.moderators).toEqual(["creator-pubkey"]);
    expect(result?.relays.all).toEqual(["wss://valid.relay"]);
    expect(result?.relays.requests).toEqual(["wss://valid.relay"]);
    expect(result?.relays.approvals).toEqual([]);
  });
});
