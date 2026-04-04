import { NostrEvent } from "@/utils/types/types";
import { NostrManager } from "../nostr-manager";
import {
  NIP50_EOSE_GRACE_MS,
  NIP50_SEARCH_RELAYS,
  NIP50_SEARCH_TIMEOUT_MS,
  mergeAndDeduplicateProducts,
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
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("returns empty results and skips fetch for an empty query", async () => {
    const subscribeMock = jest.fn();
    const nostr = { subscribe: subscribeMock } as unknown as NostrManager;

    await expect(searchListingsNip50(nostr, "   ")).resolves.toEqual([]);
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it("builds a NIP-50 filter, queries all relays in parallel, and deduplicates globally", async () => {
    const remoteEvents = [
      makeEvent({
        id: "evt-1",
        pubkey: "pub-1",
        createdAt: 1,
        dTag: "camera-1",
      }),
    ];
    const subscribeMock = jest
      .fn()
      .mockImplementation(
        async (
          _filters: any,
          params: { onevent?: (event: NostrEvent) => void; oneose?: () => void }
        ) => {
          params.onevent?.(remoteEvents[0]!);
          params.oneose?.();
          return { close: jest.fn() };
        }
      );
    const nostr = { subscribe: subscribeMock } as unknown as NostrManager;

    const resultPromise = searchListingsNip50(nostr, "camera", {
      relayUrls: NIP50_SEARCH_RELAYS,
      hardTimeoutMs: NIP50_SEARCH_TIMEOUT_MS,
      eoseGraceMs: NIP50_EOSE_GRACE_MS,
    });
    jest.advanceTimersByTime(NIP50_EOSE_GRACE_MS);
    const result = await resultPromise;

    expect(result).toEqual(remoteEvents);
    expect(subscribeMock).toHaveBeenCalledTimes(2);

    const [filters, params, relays] = subscribeMock.mock.calls[0];
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({
      kinds: [30402],
      search: "camera",
      limit: 100,
    });
    expect(typeof params.onevent).toBe("function");
    expect(typeof params.oneose).toBe("function");
    expect(relays).toEqual([NIP50_SEARCH_RELAYS[0]]);
    expect(subscribeMock.mock.calls[1][2]).toEqual([NIP50_SEARCH_RELAYS[1]]);
  });

  it("uses an overridden relay URL when provided", async () => {
    const subscribeMock = jest
      .fn()
      .mockImplementation(
        async (
          _filters: any,
          params: { oneose?: () => void },
          _relays: string[]
        ) => {
          params.oneose?.();
          return { close: jest.fn() };
        }
      );
    const nostr = { subscribe: subscribeMock } as unknown as NostrManager;

    const resultPromise = searchListingsNip50(
      nostr,
      "vintage",
      "wss://custom-relay.example"
    );
    jest.advanceTimersByTime(NIP50_EOSE_GRACE_MS);
    await resultPromise;

    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock.mock.calls[0][2]).toEqual(["wss://custom-relay.example"]);
  });

  it("falls back to next relay when the first relay fails", async () => {
    jest.useRealTimers();

    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const subscribeMock = jest
      .fn()
      .mockRejectedValueOnce(new Error("relay down"))
      .mockImplementationOnce(
        async (
          _filters: any,
          params: { onevent?: (event: NostrEvent) => void; oneose?: () => void },
          _relays: string[]
        ) => {
          params.onevent?.(
            makeEvent({
              id: "fallback-1",
              pubkey: "pub-fallback",
              createdAt: 1,
              dTag: "fallback",
            })
          );
          params.oneose?.();
          return { close: jest.fn() };
        }
      );
    const nostr = { subscribe: subscribeMock } as unknown as NostrManager;

    const resultPromise = searchListingsNip50(nostr, "camera", {
      relayUrls: NIP50_SEARCH_RELAYS,
      hardTimeoutMs: 200,
      eoseGraceMs: 5,
    });
    const result = await resultPromise;

    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(subscribeMock.mock.calls[0][2]).toEqual([NIP50_SEARCH_RELAYS[0]]);
    expect(subscribeMock.mock.calls[1][2]).toEqual([NIP50_SEARCH_RELAYS[1]]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("fallback-1");

    consoleSpy.mockRestore();
    jest.useFakeTimers();
  });

  it("resolves by hard timeout when relay never emits EOSE", async () => {
    const subscribeMock = jest
      .fn()
      .mockImplementation(async (_filters: any, _params: any) => {
        return { close: jest.fn() };
      });
    const nostr = { subscribe: subscribeMock } as unknown as NostrManager;

    const resultPromise = searchListingsNip50(nostr, "camera", {
      relayUrls: ["wss://relay.timeout"],
      hardTimeoutMs: 50,
      eoseGraceMs: 10,
    });

    jest.advanceTimersByTime(50);
    await expect(resultPromise).resolves.toEqual([]);
  });

  it("supports abort cancellation", async () => {
    const subscribeMock = jest
      .fn()
      .mockImplementation(async (_filters: any, _params: any) => {
        return { close: jest.fn() };
      });
    const nostr = { subscribe: subscribeMock } as unknown as NostrManager;
    const controller = new AbortController();

    const resultPromise = searchListingsNip50(nostr, "camera", {
      relayUrls: ["wss://relay.abort"],
      signal: controller.signal,
      hardTimeoutMs: NIP50_SEARCH_TIMEOUT_MS,
      eoseGraceMs: NIP50_EOSE_GRACE_MS,
    });

    controller.abort();
    await expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });
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
