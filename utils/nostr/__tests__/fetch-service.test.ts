describe("fetchProfile", () => {
  const pubkey =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("keeps the latest kind 0 profile from the DB and ignores shop profile rows", async () => {
    const verifyNip05Identifier = jest.fn().mockResolvedValue(false);
    const cacheEventsToDatabase = jest.fn();

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier,
    }));

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchProfile } = await import("../fetch-service");

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "latest-user-profile",
          pubkey,
          created_at: 300,
          kind: 0,
          tags: [],
          content: JSON.stringify({
            display_name: "Latest User",
            name: "latest-user",
          }),
          sig: "sig-latest-user-profile",
        },
        {
          id: "shop-profile",
          pubkey,
          created_at: 250,
          kind: 30019,
          tags: [],
          content: JSON.stringify({
            name: "Latest Shop",
            about: "Shop profile content should not populate user settings.",
          }),
          sig: "sig-shop-profile",
        },
        {
          id: "older-user-profile",
          pubkey,
          created_at: 200,
          kind: 0,
          tags: [],
          content: JSON.stringify({
            display_name: "Older User",
            name: "older-user",
          }),
          sig: "sig-older-user-profile",
        },
      ],
    }) as typeof global.fetch;

    const editProfileContext = jest.fn();
    const nostr = {
      fetch: jest.fn().mockResolvedValue([]),
    } as any;

    const { profileMap } = await fetchProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      editProfileContext
    );

    expect(profileMap.get(pubkey)).toMatchObject({
      pubkey,
      created_at: 300,
      content: {
        display_name: "Latest User",
        name: "latest-user",
      },
    });
    expect(profileMap.get(pubkey)?.content.about).toBeUndefined();
    expect(editProfileContext).toHaveBeenLastCalledWith(profileMap, false);
    expect(cacheEventsToDatabase).not.toHaveBeenCalled();
  });
});

describe("fetchAllPosts", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("stops loading products when aborted before the first DB batch resolves", async () => {
    const cacheEventsToDatabase = jest.fn();

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    const editProductContext = jest.fn();
    const nostr = {
      fetch: jest.fn(),
    } as any;

    global.fetch = jest.fn((_, init) => {
      return new Promise((_, reject) => {
        const abortError = Object.assign(new Error("Aborted"), {
          name: "AbortError",
        });

        if (init && typeof (init as RequestInit).signal?.addEventListener === "function") {
          const signal = (init as RequestInit).signal as AbortSignal;
          if (signal.aborted) {
            reject(abortError);
            return;
          }
          signal.addEventListener(
            "abort",
            () => {
              reject(abortError);
            },
            { once: true }
          );
        }
      });
    }) as typeof global.fetch;

    const abortController = new AbortController();
    const promise = fetchAllPosts(
      nostr,
      ["wss://relay.example"],
      editProductContext,
      abortController.signal
    );

    abortController.abort();

    await expect(promise).resolves.toEqual({
      productEvents: [],
      profileSetFromProducts: expect.any(Set),
    });

    expect(editProductContext).not.toHaveBeenCalled();
    expect(nostr.fetch).not.toHaveBeenCalled();
    expect(cacheEventsToDatabase).not.toHaveBeenCalled();
  });

  it("passes the abort signal through to the relay fetch stage", async () => {
    const cacheEventsToDatabase = jest.fn();

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    const editProductContext = jest.fn();
    let observedSignal: AbortSignal | undefined;
    const nostr = {
      fetch: jest.fn((_filters, _params, _relays, signal) => {
        observedSignal = signal;
        return new Promise((resolve) => {
          signal?.addEventListener(
            "abort",
            () => {
              resolve([]);
            },
            { once: true }
          );
        });
      }),
    } as any;

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as typeof global.fetch;

    const abortController = new AbortController();
    const promise = fetchAllPosts(
      nostr,
      ["wss://relay.example"],
      editProductContext,
      abortController.signal
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(nostr.fetch).toHaveBeenCalledTimes(1);
    expect(observedSignal).toBe(abortController.signal);

    abortController.abort();

    await expect(promise).resolves.toEqual({
      productEvents: [],
      profileSetFromProducts: expect.any(Set),
    });

    expect(editProductContext).not.toHaveBeenCalled();
    expect(cacheEventsToDatabase).not.toHaveBeenCalled();
  });
});
