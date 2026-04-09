describe("fetchAllPosts", () => {
  const relayPubkey =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const dbOnlyPubkey =
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const zapPubkey =
    "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.fetch = jest.fn() as typeof global.fetch;
  });

  function createProductEvent({
    id,
    pubkey,
    created_at,
    dTag,
  }: {
    id: string;
    pubkey: string;
    created_at: number;
    dTag: string;
  }) {
    return {
      id,
      pubkey,
      created_at,
      kind: 30402,
      tags: [["d", dTag]],
      content: JSON.stringify({ title: id }),
      sig: `sig-${id}`,
    };
  }

  it("hydrates from the DB first and replaces older listing events with newer relay results", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    const dbListing = createProductEvent({
      id: "db-listing-old",
      pubkey: relayPubkey,
      created_at: 100,
      dTag: "listing-a",
    });
    const dbOnlyListing = createProductEvent({
      id: "db-listing-only",
      pubkey: dbOnlyPubkey,
      created_at: 110,
      dTag: "listing-b",
    });
    const relayListing = createProductEvent({
      id: "relay-listing-new",
      pubkey: relayPubkey,
      created_at: 200,
      dTag: "listing-a",
    });
    const zapsnagEvent = {
      id: "zap-1",
      pubkey: zapPubkey,
      created_at: 150,
      kind: 1,
      tags: [["t", "shopstr-zapsnag"]],
      content: "zap",
      sig: "sig-zap-1",
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [dbListing, dbOnlyListing],
    }) as typeof global.fetch;

    const editProductContext = jest.fn();
    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayListing, zapsnagEvent]),
    } as unknown as Parameters<typeof fetchAllPosts>[0];

    const result = await fetchAllPosts(
      nostr,
      ["wss://relay.example"],
      editProductContext
    );

    expect(editProductContext).toHaveBeenNthCalledWith(
      1,
      [dbListing, dbOnlyListing],
      false
    );
    expect(editProductContext).toHaveBeenLastCalledWith(
      result.productEvents,
      false
    );
    expect(result.productEvents).toHaveLength(3);
    expect(
      result.productEvents.find(
        (event) =>
          event.kind === 30402 &&
          event.pubkey === relayPubkey &&
          event.tags.some((tag) => tag[0] === "d" && tag[1] === "listing-a")
      )?.id
    ).toBe("relay-listing-new");
    expect(result.productEvents.some((event) => event.id === "db-listing-only")).toBe(
      true
    );
    expect(result.productEvents.some((event) => event.id === "zap-1")).toBe(
      true
    );
    expect(Array.from(result.profileSetFromProducts)).toEqual(
      expect.arrayContaining([relayPubkey, dbOnlyPubkey, zapPubkey])
    );
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([
      relayListing,
      zapsnagEvent,
    ]);
  });

  it("keeps the DB listing when the relay returns an older version of the same product", async () => {
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier: jest.fn(),
    }));

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchAllPosts } = await import("../fetch-service");

    const dbListing = createProductEvent({
      id: "db-listing-newer",
      pubkey: relayPubkey,
      created_at: 300,
      dTag: "listing-a",
    });
    const relayListing = createProductEvent({
      id: "relay-listing-older",
      pubkey: relayPubkey,
      created_at: 200,
      dTag: "listing-a",
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [dbListing],
    }) as typeof global.fetch;

    const editProductContext = jest.fn();
    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayListing]),
    } as unknown as Parameters<typeof fetchAllPosts>[0];

    const result = await fetchAllPosts(
      nostr,
      ["wss://relay.example"],
      editProductContext
    );

    expect(result.productEvents).toHaveLength(1);
    expect(result.productEvents[0]?.id).toBe("db-listing-newer");
    expect(editProductContext).toHaveBeenLastCalledWith(
      result.productEvents,
      false
    );
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayListing]);
  });
});

describe("fetchProfile", () => {
  const pubkey =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const preservedPubkey =
    "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.fetch = jest.fn() as typeof global.fetch;
  });

  function createProfileEvent({
    id,
    pubkey,
    created_at,
    content,
    kind = 0,
  }: {
    id: string;
    pubkey: string;
    created_at: number;
    content: Record<string, unknown>;
    kind?: number;
  }) {
    return {
      id,
      pubkey,
      created_at,
      kind,
      tags: [],
      content: JSON.stringify(content),
      sig: `sig-${id}`,
    };
  }

  it("keeps the latest kind 0 profile from the DB and ignores shop profile rows", async () => {
    const verifyNip05Identifier = jest.fn().mockResolvedValue(false);
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

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
        createProfileEvent({
          id: "latest-user-profile",
          pubkey,
          created_at: 300,
          content: {
            display_name: "Latest User",
            name: "latest-user",
          },
        }),
        createProfileEvent({
          id: "shop-profile",
          pubkey,
          created_at: 250,
          kind: 30019,
          content: {
            name: "Latest Shop",
            about: "Shop profile content should not populate user settings.",
          },
        }),
        createProfileEvent({
          id: "older-user-profile",
          pubkey,
          created_at: 200,
          content: {
            display_name: "Older User",
            name: "older-user",
          },
        }),
      ],
    }) as typeof global.fetch;

    const editProfileContext = jest.fn();
    const nostr = {
      fetch: jest.fn().mockResolvedValue([]),
    } as unknown as Parameters<typeof fetchProfile>[0];

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

  it("preserves the existing profile map when no pubkeys are requested", async () => {
    const verifyNip05Identifier = jest.fn();

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier,
    }));

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
    }));

    const { fetchProfile } = await import("../fetch-service");

    const preservedProfile = {
      pubkey: preservedPubkey,
      created_at: 500,
      content: { display_name: "Preserved User" },
      nip05Verified: false,
    };
    const existingProfileMap = new Map([[preservedPubkey, preservedProfile]]);
    const editProfileContext = jest.fn();
    const nostr = {
      fetch: jest.fn(),
    } as unknown as Parameters<typeof fetchProfile>[0];

    const result = await fetchProfile(
      nostr,
      ["wss://relay.example"],
      [],
      editProfileContext,
      existingProfileMap
    );

    expect(nostr.fetch).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.profileMap).toEqual(existingProfileMap);
    expect(editProfileContext).toHaveBeenCalledWith(existingProfileMap, false);
    expect(verifyNip05Identifier).not.toHaveBeenCalled();
  });

  it("hydrates from the DB first, preserves unrelated profiles, and replaces them with newer relay profiles", async () => {
    const verifyNip05Identifier = jest.fn().mockResolvedValue(true);
    const cacheEventsToDatabase = jest.fn().mockResolvedValue(undefined);

    jest.doMock("@/utils/nostr/nostr-helper-functions", () => ({
      getLocalStorageData: jest.fn(),
      deleteEvent: jest.fn(),
      verifyNip05Identifier,
    }));

    jest.doMock("@/utils/db/db-client", () => ({
      cacheEventsToDatabase,
    }));

    const { fetchProfile } = await import("../fetch-service");

    const dbProfile = createProfileEvent({
      id: "db-profile",
      pubkey,
      created_at: 300,
      content: {
        display_name: "DB User",
        nip05: "db@example.com",
      },
    });
    const relayProfile = createProfileEvent({
      id: "relay-profile",
      pubkey,
      created_at: 400,
      content: {
        display_name: "Relay User",
        nip05: "relay@example.com",
      },
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [dbProfile],
    }) as typeof global.fetch;

    const existingProfileMap = new Map([
      [
        preservedPubkey,
        {
          pubkey: preservedPubkey,
          created_at: 250,
          content: { display_name: "Preserved User" },
          nip05Verified: false,
        },
      ],
    ]);

    const editProfileContext = jest.fn();
    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayProfile]),
    } as unknown as Parameters<typeof fetchProfile>[0];

    const result = await fetchProfile(
      nostr,
      ["wss://relay.example"],
      [pubkey],
      editProfileContext,
      existingProfileMap
    );

    expect(editProfileContext).toHaveBeenNthCalledWith(
      1,
      new Map([
        ...existingProfileMap,
        [
          pubkey,
          expect.objectContaining({
            created_at: 300,
            content: expect.objectContaining({ display_name: "DB User" }),
          }),
        ],
      ]),
      false
    );
    expect(result.profileMap.get(pubkey)).toMatchObject({
      pubkey,
      created_at: 400,
      content: {
        display_name: "Relay User",
        nip05: "relay@example.com",
      },
      nip05Verified: true,
    });
    expect(result.profileMap.get(preservedPubkey)).toEqual(
      existingProfileMap.get(preservedPubkey)
    );
    expect(editProfileContext).toHaveBeenLastCalledWith(result.profileMap, false);
    expect(verifyNip05Identifier).toHaveBeenCalledWith("db@example.com", pubkey);
    expect(verifyNip05Identifier).toHaveBeenCalledWith(
      "relay@example.com",
      pubkey
    );
    expect(cacheEventsToDatabase).toHaveBeenCalledWith([relayProfile]);
  });
});
