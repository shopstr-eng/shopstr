jest.mock("nostr-tools", () => ({
  ...jest.requireActual("nostr-tools"),
  getEventHash: jest.fn(() => "f".repeat(64)),
}));

import {
  constructGiftWrappedEvent,
  getDefaultBlossomServer,
  getDefaultMint,
  getDefaultRelays,
  getLocalStorageData,
  publishReportEvent,
  setLocalStorageDataOnSignIn,
} from "../nostr-helper-functions";
import { ProductData } from "@/utils/parsers/product-parser-functions";

describe("constructGiftWrappedEvent", () => {
  const senderPubkey =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const recipientPubkey =
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const relay = "wss://relay.example";

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify([relay]));
  });

  it("constructs order tags for payment, item, buyer, and selected option metadata", async () => {
    const productData = {
      pubkey: "seller-pubkey",
      d: "listing-1",
    } as ProductData;

    const event = await constructGiftWrappedEvent(
      senderPubkey,
      recipientPubkey,
      "Payment sent",
      "order-payment",
      {
        isOrder: true,
        orderId: "order-1",
        type: 1,
        paymentType: "cashu",
        paymentReference: "cashuA-token",
        paymentProof: "proof-1",
        orderAmount: 12345,
        status: "paid",
        productData,
        quantity: 2,
        buyerPubkey: "buyer-pubkey",
        selectedSize: "M",
        selectedVolume: "250ml",
        selectedWeight: "1lb",
        selectedBulkOption: 5,
        donationAmount: 100,
        donationPercentage: 2,
      }
    );

    expect(event).toMatchObject({
      id: "f".repeat(64),
      pubkey: senderPubkey,
      content: "Payment sent",
      kind: 14,
    });
    expect(event.tags).toEqual(
      expect.arrayContaining([
        ["p", recipientPubkey, relay],
        ["subject", "order-payment"],
        ["order", "order-1"],
        ["b", "buyer-pubkey"],
        ["type", "1"],
        ["amount", "12345"],
        ["payment", "cashu", "cashuA-token", "proof-1"],
        ["status", "paid"],
        ["item", "30402:seller-pubkey:listing-1", "2"],
        ["size", "M"],
        ["volume", "250ml"],
        ["weight", "1lb"],
        ["bulk", "5"],
        ["donation_amount", "100", "2"],
      ])
    );
  });

  it("uses an explicit product address when product data is unavailable", async () => {
    const event = await constructGiftWrappedEvent(
      senderPubkey,
      recipientPubkey,
      "Ship this listing",
      "shipping-info",
      {
        isOrder: true,
        orderId: "order-2",
        productAddress: "30402:seller-pubkey:legacy-d-tag",
      }
    );

    expect(event.tags).toEqual(
      expect.arrayContaining([
        ["order", "order-2"],
        ["item", "30402:seller-pubkey:legacy-d-tag", "1"],
      ])
    );
  });
});

describe("local storage sign-in helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it("stores safe defaults for empty relay, mint, and blossom inputs", () => {
    const dispatchSpy = jest.spyOn(window, "dispatchEvent");

    setLocalStorageDataOnSignIn({
      relays: [],
      mints: [],
      blossomServers: [],
      wot: 0,
    });

    const data = getLocalStorageData();
    expect(data.relays).toEqual(getDefaultRelays());
    expect(data.mints).toEqual([getDefaultMint()]);
    expect(data.blossomServers).toEqual([getDefaultBlossomServer()]);
    expect(data.wot).toBe(3);
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
  });

  it("reconstructs a legacy bunker signer from key and relay storage", () => {
    localStorage.setItem("signInMethod", "bunker");
    localStorage.setItem("clientPrivkey", "client-secret");
    localStorage.setItem("bunkerRemotePubkey", "remote-pubkey");
    localStorage.setItem(
      "bunkerRelays",
      JSON.stringify(["wss://one.example", "", "wss://two.example"])
    );
    localStorage.setItem("bunkerSecret", "shared-secret");

    expect(getLocalStorageData().signer).toEqual({
      type: "nip46",
      bunker:
        "bunker://remote-pubkey?secret=shared-secret&relay=wss://one.example&relay=wss://two.example",
      appPrivKey: "client-secret",
    });
  });
});

describe("publishReportEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  it("builds a valid profile report event", async () => {
    const signer = {
      sign: jest.fn().mockImplementation(async (eventTemplate) => ({
        ...eventTemplate,
        id: "signed-profile-report",
        pubkey: "reporter-pubkey",
        sig: "signed-sig",
      })),
    };
    const nostr = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const signedEvent = await publishReportEvent(nostr as any, signer as any, {
      content: "Spam account",
      reportType: "spam",
      reportedPubkey: "seller-pubkey",
    });

    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 1984,
        content: "Spam account",
        tags: [["p", "seller-pubkey", "spam"]],
      })
    );
    expect(signedEvent).toEqual(
      expect.objectContaining({
        id: "signed-profile-report",
        kind: 1984,
      })
    );
  });

  it("builds a valid listing report event", async () => {
    const signer = {
      sign: jest.fn().mockImplementation(async (eventTemplate) => ({
        ...eventTemplate,
        id: "signed-listing-report",
        pubkey: "reporter-pubkey",
        sig: "signed-sig",
      })),
    };
    const nostr = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    await publishReportEvent(nostr as any, signer as any, {
      content: "Listing looks illegal",
      reportType: "illegal",
      reportedPubkey: "seller-pubkey",
      reportedEventId: "listing-event-id",
    });

    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 1984,
        content: "Listing looks illegal",
        tags: [
          ["e", "listing-event-id", "illegal"],
          ["p", "seller-pubkey"],
        ],
      })
    );
  });
});

describe("follow/unfollow contact list mutations", () => {
  const userPubkey =
    "1111111111111111111111111111111111111111111111111111111111111111";
  const targetA =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const targetB =
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const targetC =
    "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

  const makeContactListEvent = (overrides: Partial<any> = {}) => ({
    id: "base-contact-list",
    pubkey: userPubkey,
    created_at: 100,
    kind: 3,
    tags: [] as string[][],
    content: "",
    sig: "base-sig",
    ...overrides,
  });

  const loadFollowHelpers = async () => {
    jest.resetModules();
    return await import("../nostr-helper-functions");
  };

  const createSigner = (pubkey = userPubkey) => {
    let signedCount = 0;
    const sign = jest.fn(async (eventTemplate: any) => ({
      ...eventTemplate,
      id: `signed-${++signedCount}`,
      pubkey,
      sig: "signed-sig",
    }));

    return {
      getPubKey: jest.fn().mockResolvedValue(pubkey),
      sign,
    };
  };

  const createNostr = (relayEvents: any[] | Promise<any[]> = []) => ({
    fetch: jest.fn().mockResolvedValue(relayEvents),
    publish: jest.fn().mockResolvedValue(undefined),
  });

  const mockContactListFetch = (contactList: any | null) => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (typeof url === "string" && url.startsWith("/api/db/fetch-contacts")) {
        return {
          ok: true,
          json: async () => ({ contactList }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as typeof global.fetch;
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    mockContactListFetch(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns null for invalid target pubkeys without signing", async () => {
    const { followUser, unfollowUser } = await loadFollowHelpers();
    const signer = createSigner();
    const nostr = createNostr();

    await expect(
      followUser(nostr as any, signer as any, "not-a-pubkey")
    ).resolves.toBeNull();
    await expect(
      unfollowUser(nostr as any, signer as any, "still-not-a-pubkey")
    ).resolves.toBeNull();

    expect(signer.getPubKey).not.toHaveBeenCalled();
    expect(signer.sign).not.toHaveBeenCalled();
    expect(nostr.fetch).not.toHaveBeenCalled();
  });

  it("returns null for self-follow without signing", async () => {
    const { followUser } = await loadFollowHelpers();
    const signer = createSigner(userPubkey);
    const nostr = createNostr();

    await expect(
      followUser(nostr as any, signer as any, userPubkey)
    ).resolves.toBeNull();

    expect(signer.getPubKey).toHaveBeenCalled();
    expect(signer.sign).not.toHaveBeenCalled();
    expect(nostr.fetch).not.toHaveBeenCalled();
  });

  it("follows by appending one p tag while preserving existing tags and content", async () => {
    const { followUser } = await loadFollowHelpers();
    const baseEvent = makeContactListEvent({
      tags: [
        ["p", targetB],
        ["relay", "wss://relay.example"],
      ],
      content: "existing content",
    });
    const signer = createSigner();
    const nostr = createNostr([baseEvent]);

    const result = await followUser(nostr as any, signer as any, targetA);

    expect(result).toEqual(expect.objectContaining({ kind: 3 }));
    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 3,
        tags: [
          ["p", targetB],
          ["relay", "wss://relay.example"],
          ["p", targetA],
        ],
        content: "existing content",
      })
    );
  });

  it("unfollows by removing matching p tags while preserving other tags and content", async () => {
    const { unfollowUser } = await loadFollowHelpers();
    const baseEvent = makeContactListEvent({
      tags: [
        ["p", targetA],
        ["p", targetB],
        ["p", targetA, "wss://relay.example"],
        ["relay", "wss://relay.example"],
      ],
      content: "existing content",
    });
    const signer = createSigner();
    const nostr = createNostr([baseEvent]);

    await unfollowUser(nostr as any, signer as any, targetA);

    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 3,
        tags: [
          ["p", targetB],
          ["relay", "wss://relay.example"],
        ],
        content: "existing content",
      })
    );
  });

  it("does not sign when following an already-followed target", async () => {
    const { followUser } = await loadFollowHelpers();
    const baseEvent = makeContactListEvent({
      tags: [["p", targetA]],
    });
    const signer = createSigner();
    const nostr = createNostr([baseEvent]);

    const result = await followUser(nostr as any, signer as any, targetA);

    expect(result).toBe(baseEvent);
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it("does not sign when unfollowing a non-followed target", async () => {
    const { unfollowUser } = await loadFollowHelpers();
    const baseEvent = makeContactListEvent({
      tags: [["p", targetB]],
    });
    const signer = createSigner();
    const nostr = createNostr([baseEvent]);

    const result = await unfollowUser(nostr as any, signer as any, targetA);

    expect(result).toBe(baseEvent);
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it("serializes concurrent mutations so both unfollows are preserved", async () => {
    const { unfollowUser } = await loadFollowHelpers();
    const baseEvent = makeContactListEvent({
      tags: [
        ["p", targetA],
        ["p", targetB],
        ["p", targetC],
      ],
    });
    const signer = createSigner();
    const nostr = createNostr([baseEvent]);

    await Promise.all([
      unfollowUser(nostr as any, signer as any, targetA),
      unfollowUser(nostr as any, signer as any, targetB),
    ]);

    expect(signer.sign).toHaveBeenCalledTimes(2);
    expect(signer.sign.mock.calls[0]![0].tags).toEqual([
      ["p", targetB],
      ["p", targetC],
    ]);
    expect(signer.sign.mock.calls[1]![0].tags).toEqual([["p", targetC]]);
  });

  it("collapses duplicate same-target queued follows into one signature", async () => {
    const { followUser } = await loadFollowHelpers();
    const baseEvent = makeContactListEvent();
    const signer = createSigner();
    const nostr = createNostr([baseEvent]);

    const [firstResult, secondResult] = await Promise.all([
      followUser(nostr as any, signer as any, targetA),
      followUser(nostr as any, signer as any, targetA),
    ]);

    expect(signer.sign).toHaveBeenCalledTimes(1);
    expect(secondResult).toBe(firstResult);
  });

  it("uses DB fallback and still signs when relay contact-list fetch times out", async () => {
    jest.useFakeTimers();
    const { followUser } = await loadFollowHelpers();
    const dbEvent = makeContactListEvent({
      tags: [["p", targetB]],
      content: "db content",
    });
    mockContactListFetch(dbEvent);
    const signer = createSigner();
    const nostr = {
      fetch: jest.fn(() => new Promise(() => {})),
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const followPromise = followUser(nostr as any, signer as any, targetA);
    await jest.advanceTimersByTimeAsync(3000);
    const result = await followPromise;

    expect(result).toEqual(expect.objectContaining({ kind: 3 }));
    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [
          ["p", targetB],
          ["p", targetA],
        ],
        content: "db content",
      })
    );
  });

  it("uses increasing created_at values for same-second sequential mutations", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    const { followUser } = await loadFollowHelpers();
    const baseEvent = makeContactListEvent({
      created_at: 999,
      tags: [],
    });
    const signer = createSigner();
    const nostr = createNostr([baseEvent]);

    await followUser(nostr as any, signer as any, targetA);
    await followUser(nostr as any, signer as any, targetB);

    expect(signer.sign).toHaveBeenCalledTimes(2);
    expect(signer.sign.mock.calls[0]![0].created_at).toBe(1000);
    expect(signer.sign.mock.calls[1]![0].created_at).toBe(1001);
  });

  it("refuses mutation when all sources timeout to prevent overwriting existing follows", async () => {
    jest.useFakeTimers();
    const { followUser } = await loadFollowHelpers();
    const signer = createSigner();

    // Relay never resolves (simulates hang)
    const nostr = {
      fetch: jest.fn(() => new Promise(() => {})),
      publish: jest.fn().mockResolvedValue(undefined),
    };

    // DB also never resolves (simulates hang)
    global.fetch = jest.fn(() => new Promise(() => {})) as typeof global.fetch;

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const followPromise = followUser(nostr as any, signer as any, targetA);
    // Advance past the contact-list fetch timeout
    await jest.advanceTimersByTimeAsync(3000);
    const result = await followPromise;

    // Must refuse — returning null instead of creating a fresh [targetA] list
    expect(result).toBeNull();
    expect(signer.sign).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("could not reach relays or database")
    );

    warnSpy.mockRestore();
  });

  it("allows a fresh follow when DB genuinely responds with no contact list", async () => {
    jest.useFakeTimers();
    const { followUser } = await loadFollowHelpers();
    const signer = createSigner();

    // Relay never resolves (timeout)
    const nostr = {
      fetch: jest.fn(() => new Promise(() => {})),
      publish: jest.fn().mockResolvedValue(undefined),
    };

    // DB responds genuinely with null (user has no follows)
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (typeof url === "string" && url.startsWith("/api/db/fetch-contacts")) {
        return {
          ok: true,
          json: async () => ({ contactList: null }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as typeof global.fetch;

    const followPromise = followUser(nostr as any, signer as any, targetA);
    await jest.advanceTimersByTimeAsync(3000);
    const result = await followPromise;

    // DB responded (didRespond: true) so mutation should proceed
    // even though relay timed out and DB had no contact list
    expect(result).toEqual(expect.objectContaining({ kind: 3 }));
    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [["p", targetA]],
      })
    );
  });
});
