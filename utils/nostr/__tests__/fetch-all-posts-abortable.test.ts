const makeBaseEvent = (overrides: Record<string, any> = {}) => ({
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

const makeProductEvent = (overrides: Record<string, any> = {}) =>
  makeBaseEvent({
    kind: 30402,
    tags: [["d", "listing-1"]],
    ...overrides,
  });

const makeDbPayload = <T>(items: T[]) => ({
  ok: true,
  json: async () => items,
});

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
    const nostr = {
      subscribe: jest.fn(),
    } as any;

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

    let params: { onevent: (event: any) => void } | undefined;
    const sub = {
      close: jest.fn().mockResolvedValue(undefined),
    };
    const nostr = {
      subscribe: jest.fn((_filters, subscribeParams) => {
        params = subscribeParams;
        return Promise.resolve(sub);
      }),
    } as any;

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
    params!.onevent(makeProductEvent({ id: "relay-product" }));
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

    let params:
      | {
          onevent: (event: any) => void;
          oneose: () => void;
        }
      | undefined;
    const sub = {
      close: jest.fn().mockResolvedValue(undefined),
    };
    const nostr = {
      subscribe: jest.fn((_filters, subscribeParams) => {
        params = subscribeParams;
        return Promise.resolve(sub);
      }),
    } as any;

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
    params!.onevent(relayProduct);
    params!.onevent(invalidProduct);
    params!.oneose();

    await expect(promise).resolves.toEqual({
      productEvents: [relayProduct],
      profileSetFromProducts: new Set(["seller"]),
    });
    expect(editProductContext).toHaveBeenLastCalledWith([relayProduct], false);
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayProduct]);
    expect(sub.close).toHaveBeenCalledTimes(1);
  });
});
