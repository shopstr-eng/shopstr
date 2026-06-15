import type { NostrEvent, NostrManager, NostrSub } from "../nostr-manager";
import type { SubscribeManyParams } from "nostr-tools/abstract-pool";

type SubscriberMock = Pick<NostrManager, "subscribe">;

const makeBaseEvent = (overrides: Partial<NostrEvent> = {}): NostrEvent => ({
  id: "event-id",
  pubkey: "pubkey",
  created_at: 1,
  kind: 1,
  tags: [],
  content: "",
  sig: "sig",
  ...overrides,
});

export {};

const makeProductEvent = (overrides: Partial<NostrEvent> = {}) =>
  makeBaseEvent({
    kind: 30402,
    tags: [["d", "listing-1"]],
    ...overrides,
  });

const makeDbPayload = <T>(items: T[]) => ({
  ok: true,
  json: async () => items,
});

const makeSub = (): NostrSub => ({
  _sub: { close: jest.fn() },
  close: jest.fn().mockResolvedValue(undefined),
});

const emitRelayEvent = (
  params: SubscribeManyParams | undefined,
  event: NostrEvent
) => {
  if (!params?.onevent) {
    throw new Error("Expected relay onevent callback to be registered");
  }
  params.onevent(event);
};

const emitRelayEose = (params: SubscribeManyParams | undefined) => {
  if (!params?.oneose) {
    throw new Error("Expected relay oneose callback to be registered");
  }
  params.oneose();
};

describe("fetchAllPostsAbortable", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("stops loading products when aborted before the first DB batch resolves", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPostsAbortable } =
      await import("../fetch-all-posts-abortable");

    const editProductContext = jest.fn();
    const nostr: SubscriberMock = {
      subscribe: jest.fn(),
    };

    global.fetch = jest.fn((_, init) => {
      return new Promise((_, reject) => {
        const abortError = Object.assign(new Error("Aborted"), {
          name: "AbortError",
        });
        const signal = (init as RequestInit | undefined)?.signal;

        if (signal?.aborted) {
          reject(abortError);
          return;
        }

        signal?.addEventListener(
          "abort",
          () => {
            reject(abortError);
          },
          { once: true }
        );
      });
    }) as typeof global.fetch;

    const abortController = new AbortController();
    const promise = fetchAllPostsAbortable(
      nostr,
      ["wss://relay.example"],
      editProductContext,
      abortController.signal
    );

    abortController.abort();

    await expect(promise).resolves.toEqual({
      productEvents: [],
      profileSetFromProducts: new Set(),
    });

    expect(editProductContext).not.toHaveBeenCalled();
    expect(nostr.subscribe).not.toHaveBeenCalled();
    expect(cacheEventsToDatabase).not.toHaveBeenCalled();
  });

  it("closes the relay subscription when aborted during relay loading", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPostsAbortable } =
      await import("../fetch-all-posts-abortable");

    let params: SubscribeManyParams | undefined;
    const sub = makeSub();
    const nostr: SubscriberMock = {
      subscribe: jest.fn((_filters, subscribeParams) => {
        params = subscribeParams;
        return Promise.resolve(sub);
      }),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(makeDbPayload([])) as typeof global.fetch;

    const editProductContext = jest.fn();
    const abortController = new AbortController();
    const promise = fetchAllPostsAbortable(
      nostr,
      ["wss://relay.example"],
      editProductContext,
      abortController.signal
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    emitRelayEvent(params, makeProductEvent({ id: "relay-product" }));
    abortController.abort();

    await expect(promise).resolves.toEqual({
      productEvents: [],
      profileSetFromProducts: new Set(),
    });
    expect(sub.close).toHaveBeenCalledTimes(1);
    expect(editProductContext).not.toHaveBeenCalled();
    expect(cacheEventsToDatabase).not.toHaveBeenCalled();
  });

  it("merges valid relay listings and caches only valid product events", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPostsAbortable } =
      await import("../fetch-all-posts-abortable");

    let params: SubscribeManyParams | undefined;
    const sub = makeSub();
    const nostr: SubscriberMock = {
      subscribe: jest.fn((_filters, subscribeParams) => {
        params = subscribeParams;
        return Promise.resolve(sub);
      }),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(makeDbPayload([])) as typeof global.fetch;

    const relayProduct = makeProductEvent({
      id: "relay-product",
      pubkey: "seller",
      created_at: 10,
      sig: "sig-relay-product",
    });
    const invalidProduct = makeProductEvent({
      id: "",
      pubkey: "seller",
      created_at: 20,
      sig: "sig-invalid",
    });
    const editProductContext = jest.fn();

    const promise = fetchAllPostsAbortable(
      nostr,
      ["wss://relay.example"],
      editProductContext
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    emitRelayEvent(params, relayProduct);
    emitRelayEvent(params, invalidProduct);
    emitRelayEose(params);

    await expect(promise).resolves.toEqual({
      productEvents: [relayProduct],
      profileSetFromProducts: new Set(["seller"]),
    });
    expect(editProductContext).toHaveBeenLastCalledWith([relayProduct], false);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayProduct]);
    expect(sub.close).toHaveBeenCalledTimes(1);
  });

  it("merges NIP-99 listings by pubkey and d tag across DB and relay events", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPostsAbortable } =
      await import("../fetch-all-posts-abortable");

    let params: SubscribeManyParams | undefined;
    const sub = makeSub();
    const nostr: SubscriberMock = {
      subscribe: jest.fn((_filters, subscribeParams) => {
        params = subscribeParams;
        return Promise.resolve(sub);
      }),
    };

    const cachedOlderListing = makeProductEvent({
      id: "cached-old",
      pubkey: "seller",
      created_at: 10,
      tags: [["d", "shared-listing"]],
      sig: "sig-cached-old",
    });
    const cachedSeparateListing = makeProductEvent({
      id: "cached-separate",
      pubkey: "seller",
      created_at: 11,
      tags: [["d", "separate-listing"]],
      sig: "sig-cached-separate",
    });
    const relayUpdatedListing = makeProductEvent({
      id: "relay-updated",
      pubkey: "seller",
      created_at: 20,
      tags: [["d", "shared-listing"]],
      sig: "sig-relay-updated",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        makeDbPayload([cachedOlderListing, cachedSeparateListing])
      ) as typeof global.fetch;

    const editProductContext = jest.fn();
    const promise = fetchAllPostsAbortable(
      nostr,
      ["wss://relay.example"],
      editProductContext
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    emitRelayEvent(params, relayUpdatedListing);
    emitRelayEose(params);

    await expect(promise).resolves.toEqual({
      productEvents: [relayUpdatedListing, cachedSeparateListing],
      profileSetFromProducts: new Set(["seller"]),
    });
    expect(nostr.subscribe).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          kinds: [30402],
        }),
      ]),
      expect.any(Object),
      ["wss://relay.example"]
    );
    expect(editProductContext).toHaveBeenNthCalledWith(
      1,
      [cachedOlderListing, cachedSeparateListing],
      true
    );
    expect(editProductContext).toHaveBeenLastCalledWith(
      [relayUpdatedListing, cachedSeparateListing],
      false
    );
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayUpdatedListing]);
    expect(sub.close).toHaveBeenCalledTimes(1);
  });
});
