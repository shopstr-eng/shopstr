import { NostrEvent } from "@/utils/types/types";
import { NostrManager } from "../nostr-manager";
import {
  mergeAndDeduplicateProducts,
  NIP50_SEARCH_RELAY,
  searchListingsNip50,
} from "../nip50-search";

function makeEvent({
  id,
  pubkey,
  createdAt,
  dTag,
  kind = 30402,
}: {
  id: string;
  pubkey: string;
  createdAt: number;
  dTag?: string;
  kind?: number;
}): NostrEvent {
  const tags = dTag ? [["d", dTag]] : [];
  return {
    id,
    pubkey,
    created_at: createdAt,
    kind,
    tags,
    content: "",
    sig: "sig",
  } as NostrEvent;
}

describe("searchListingsNip50", () => {
  it("returns empty results and skips fetch for an empty query", async () => {
    const fetchMock = jest.fn();
    const nostr = { fetch: fetchMock } as unknown as NostrManager;

    await expect(searchListingsNip50(nostr, "   ")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds a NIP-50 filter and uses the default search relay", async () => {
    const remoteEvents = [
      makeEvent({
        id: "evt-1",
        pubkey: "pub-1",
        createdAt: 1,
        dTag: "camera-1",
      }),
    ];
    const fetchMock = jest.fn().mockResolvedValue(remoteEvents);
    const nostr = { fetch: fetchMock } as unknown as NostrManager;

    const result = await searchListingsNip50(nostr, "camera");

    expect(result).toEqual(remoteEvents);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [filters, params, relays] = fetchMock.mock.calls[0];
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({
      kinds: [30402],
      search: "camera",
      limit: 100,
    });
    expect(params).toEqual({});
    expect(relays).toEqual([NIP50_SEARCH_RELAY]);
  });

  it("uses an overridden relay URL when provided", async () => {
    const fetchMock = jest.fn().mockResolvedValue([]);
    const nostr = { fetch: fetchMock } as unknown as NostrManager;

    await searchListingsNip50(nostr, "vintage", "wss://custom-relay.example");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][2]).toEqual(["wss://custom-relay.example"]);
  });

  it("returns empty results when relay fetch throws", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("relay down"));
    const nostr = { fetch: fetchMock } as unknown as NostrManager;

    await expect(searchListingsNip50(nostr, "camera")).resolves.toEqual([]);
  });
});

describe("mergeAndDeduplicateProducts", () => {
  it("deduplicates listings by pubkey:d-tag and keeps the newest event", () => {
    const local = [
      makeEvent({
        id: "local-old",
        pubkey: "seller-1",
        createdAt: 100,
        dTag: "listing-1",
      }),
    ];
    const remote = [
      makeEvent({
        id: "remote-new",
        pubkey: "seller-1",
        createdAt: 200,
        dTag: "listing-1",
      }),
    ];

    const merged = mergeAndDeduplicateProducts(local, remote);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("remote-new");
  });

  it("keeps unique local and remote entries", () => {
    const local = [
      makeEvent({
        id: "local-1",
        pubkey: "seller-a",
        createdAt: 100,
        dTag: "listing-a",
      }),
    ];
    const remote = [
      makeEvent({
        id: "remote-1",
        pubkey: "seller-b",
        createdAt: 120,
        dTag: "listing-b",
      }),
    ];

    const merged = mergeAndDeduplicateProducts(local, remote);
    const ids = merged.map((event) => event.id).sort();

    expect(ids).toEqual(["local-1", "remote-1"]);
  });

  it("falls back to event id when a kind 30402 event has no d-tag", () => {
    const local = [
      makeEvent({
        id: "same-id",
        pubkey: "seller-a",
        createdAt: 100,
      }),
    ];
    const remote = [
      makeEvent({
        id: "same-id",
        pubkey: "seller-a",
        createdAt: 101,
      }),
    ];

    const merged = mergeAndDeduplicateProducts(local, remote);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.created_at).toBe(101);
  });

  it("handles empty arrays", () => {
    const localOnly = [
      makeEvent({
        id: "local-only",
        pubkey: "seller-a",
        createdAt: 100,
        dTag: "listing-a",
      }),
    ];

    expect(mergeAndDeduplicateProducts([], [])).toEqual([]);
    expect(mergeAndDeduplicateProducts(localOnly, [])).toEqual(localOnly);
    expect(mergeAndDeduplicateProducts([], localOnly)).toEqual(localOnly);
  });
});
