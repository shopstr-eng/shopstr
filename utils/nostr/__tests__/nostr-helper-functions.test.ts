jest.mock("@/utils/db/db-client", () => ({
  cacheEventToDatabase: jest.fn().mockResolvedValue(undefined),
  deleteEventsFromDatabase: jest.fn().mockResolvedValue(undefined),
  trackFailedRelayPublish: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/utils/nostr/request-auth", () => ({
  buildDeleteCachedEventsProof: jest.fn().mockReturnValue({}),
  buildSignedHttpRequestProofTemplate: jest.fn().mockReturnValue({
    kind: 27235,
    content: "",
    tags: [],
    created_at: 0,
  }),
}));

jest.mock("@/utils/timeout", () => ({
  newPromiseWithTimeout: jest.fn().mockImplementation(async (fn: any) => {
    return new Promise((resolve, reject) =>
      fn(resolve, reject, new AbortController().signal)
    );
  }),
}));

jest.mock("nostr-tools", () => {
  const actual = jest.requireActual("nostr-tools");
  return {
    ...actual,
    getEventHash: jest.fn(() => "f".repeat(64)),
    finalizeEvent: jest.fn((event: any, _privkey: any) => ({
      ...event,
      id: "f".repeat(64),
      sig: "fake-sig",
    })),
    nip44: {
      ...actual.nip44,
      getConversationKey: jest.fn(),
      encrypt: jest.fn(),
      decrypt: jest.fn(),
    },
  };
});

import {
  blossomUploadImages,
  createBlossomServerEvent,
  createNostrDeleteEvent,
  createNostrProfileEvent,
  createNostrRelayEvent,
  createNostrShopEvent,
  deleteEvent,
  finalizeAndSendNostrEvent,
  followUser,
  getDefaultBlossomServer,
  getDefaultMint,
  getDefaultRelays,
  getLatestLocalContactListEvent,
  getLocalStorageData,
  getLocalUserProfileKey,
  isProfileContentPopulated,
  LogOut,
  parseLocalProfileFallback,
  PostListing,
  publishBlossomServerEvent,
  publishProofEvent,
  publishSavedForLaterEvent,
  publishSpendingHistoryEvent,
  publishWalletEvent,
  publishRelayEvent,
  publishReportEvent,
  publishReviewEvent,
  REPORT_TYPES,
  saveNWCString,
  setLocalStorageDataOnSignIn,
  verifyNip05Identifier,
  withBlastr,
} from "../nostr-helper-functions";
import {
  constructGiftWrappedEvent,
  constructMessageGiftWrap,
  constructMessageSeal,
  sendGiftWrappedMessageEvent,
} from "../gift-wrap";
import {
  approveCommunityPost,
  createCommunityPost,
  createOrUpdateCommunity,
  retractApproval,
} from "../community";
import { finalizeEvent, nip44 } from "nostr-tools";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import {
  Community,
  CommunityRelays,
  ProductFormValues,
} from "@/utils/types/types";
import {
  cacheEventToDatabase,
  deleteEventsFromDatabase,
  trackFailedRelayPublish,
} from "@/utils/db/db-client";
import {
  buildDeleteCachedEventsProof,
  buildSignedHttpRequestProofTemplate,
} from "@/utils/nostr/request-auth";
import { newPromiseWithTimeout } from "@/utils/timeout";

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

  it("returns a kind-14 event with id, pubkey, content, and p/subject tags by default", async () => {
    const event = await constructGiftWrappedEvent(
      senderPubkey,
      recipientPubkey,
      "Hello world",
      "listing-inquiry"
    );

    expect(event).toMatchObject({
      id: expect.any(String),
      pubkey: senderPubkey,
      kind: 14,
      content: "Hello world",
    });
    expect(event.tags).toHaveLength(2);
    expect(event.tags).toEqual(
      expect.arrayContaining([
        ["p", recipientPubkey, relay],
        ["subject", "listing-inquiry"],
      ])
    );
  });

  it("uses a custom kind when the option is provided", async () => {
    const event = await constructGiftWrappedEvent(
      senderPubkey,
      recipientPubkey,
      "Hello",
      "test-subject",
      { kind: 42 }
    );
    expect(event.kind).toBe(42);
  });

  it("generates a UUID order tag when orderId is absent", async () => {
    const event = await constructGiftWrappedEvent(
      senderPubkey,
      recipientPubkey,
      "Order placed",
      "order-payment",
      { isOrder: true }
    );
    const orderTag = event.tags.find((t) => t[0] === "order");
    expect(orderTag).toBeDefined();
    expect(orderTag![1]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("adds a 3-element payment tag when paymentProof is absent", async () => {
    const event = await constructGiftWrappedEvent(
      senderPubkey,
      recipientPubkey,
      "Payment",
      "order-payment",
      {
        isOrder: true,
        orderId: "order-pay3",
        paymentType: "lightning",
        paymentReference: "lnbc1234",
      }
    );
    const paymentTag = event.tags.find((t) => t[0] === "payment");
    expect(paymentTag).toEqual(["payment", "lightning", "lnbc1234"]);
  });

  it("adds tracking, carrier, and eta tags when each is present", async () => {
    const event = await constructGiftWrappedEvent(
      senderPubkey,
      recipientPubkey,
      "Shipped",
      "order-shipping",
      {
        isOrder: true,
        orderId: "order-ship",
        tracking: "1Z999AA10123456784",
        carrier: "UPS",
        eta: 1720000000,
      }
    );
    expect(event.tags).toEqual(
      expect.arrayContaining([
        ["tracking", "1Z999AA10123456784"],
        ["carrier", "UPS"],
        ["eta", "1720000000"],
      ])
    );
  });

  it("adds contact, address, and pickup tags when each is present", async () => {
    const event = await constructGiftWrappedEvent(
      senderPubkey,
      recipientPubkey,
      "Order info",
      "order-info",
      {
        isOrder: true,
        orderId: "order-cap",
        contact: "alice@example.com",
        address: "123 Main St, Springfield",
        pickup: "store-front",
      }
    );
    expect(event.tags).toEqual(
      expect.arrayContaining([
        ["contact", "alice@example.com"],
        ["address", "123 Main St, Springfield"],
        ["pickup", "store-front"],
      ])
    );
  });

  it("does not add a donation_amount tag when donationAmount is zero or negative", async () => {
    const eventZero = await constructGiftWrappedEvent(
      senderPubkey,
      recipientPubkey,
      "Order",
      "order-payment",
      {
        isOrder: true,
        orderId: "order-don-zero",
        donationAmount: 0,
        donationPercentage: 5,
      }
    );
    expect(eventZero.tags.some((t) => t[0] === "donation_amount")).toBe(false);

    const eventNeg = await constructGiftWrappedEvent(
      senderPubkey,
      recipientPubkey,
      "Order",
      "order-payment",
      {
        isOrder: true,
        orderId: "order-don-neg",
        donationAmount: -1,
        donationPercentage: 5,
      }
    );
    expect(eventNeg.tags.some((t) => t[0] === "donation_amount")).toBe(false);
  });

  it("adds an a tag with 30402:<pubkey>:<d> when productData is present in a non-order message", async () => {
    const productData = {
      pubkey: "seller-pubkey",
      d: "listing-1",
    } as ProductData;

    const event = await constructGiftWrappedEvent(
      senderPubkey,
      recipientPubkey,
      "Interested in this",
      "listing-inquiry",
      { productData }
    );

    expect(event.tags).toEqual(
      expect.arrayContaining([["a", "30402:seller-pubkey:listing-1", relay]])
    );
  });

  it("adds an a tag with productAddress when only productAddress is present in a non-order message", async () => {
    const event = await constructGiftWrappedEvent(
      senderPubkey,
      recipientPubkey,
      "Question about this item",
      "listing-inquiry",
      { productAddress: "30402:seller-pubkey:legacy-d" }
    );

    expect(event.tags).toEqual(
      expect.arrayContaining([["a", "30402:seller-pubkey:legacy-d", relay]])
    );
  });

  it("adds no extra tags when neither productData nor productAddress is provided in a non-order message", async () => {
    const event = await constructGiftWrappedEvent(
      senderPubkey,
      recipientPubkey,
      "Just a message",
      "listing-inquiry"
    );

    expect(event.tags).toHaveLength(2);
    expect(event.tags[0]).toEqual(["p", recipientPubkey, relay]);
    expect(event.tags[1]).toEqual(["subject", "listing-inquiry"]);
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

describe("setLocalStorageDataOnSignIn", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it("always writes relays, readRelays, writeRelays, mints, blossomServers, and wot", () => {
    setLocalStorageDataOnSignIn({});

    expect(localStorage.getItem("relays")).not.toBeNull();
    expect(localStorage.getItem("readRelays")).not.toBeNull();
    expect(localStorage.getItem("writeRelays")).not.toBeNull();
    expect(localStorage.getItem("mints")).not.toBeNull();
    expect(localStorage.getItem("blossomServers")).not.toBeNull();
    expect(localStorage.getItem("wot")).not.toBeNull();
  });

  it("writes encryptedPrivateKey when provided and skips the key when absent", () => {
    setLocalStorageDataOnSignIn({ encryptedPrivateKey: "enc-key-abc" });
    expect(localStorage.getItem("encryptedPrivateKey")).toBe("enc-key-abc");

    localStorage.clear();
    setLocalStorageDataOnSignIn({});
    expect(localStorage.getItem("encryptedPrivateKey")).toBeNull();
  });

  it("writes all four bunker keys when clientPubkey, clientPrivkey, bunkerRemotePubkey, and bunkerRelays are all provided", () => {
    setLocalStorageDataOnSignIn({
      clientPubkey: "pub-abc",
      clientPrivkey: "priv-abc",
      bunkerRemotePubkey: "remote-pubkey",
      bunkerRelays: ["wss://relay.example"],
    });

    expect(localStorage.getItem("clientPubkey")).toBe("pub-abc");
    expect(localStorage.getItem("clientPrivkey")).toBe("priv-abc");
    expect(localStorage.getItem("bunkerRemotePubkey")).toBe("remote-pubkey");
    expect(localStorage.getItem("bunkerRelays")).toBe(
      JSON.stringify(["wss://relay.example"])
    );
  });

  it("does not write bunker keys when any of the four required fields is missing", () => {
    setLocalStorageDataOnSignIn({
      clientPubkey: "pub-abc",
      clientPrivkey: "priv-abc",
      bunkerRemotePubkey: "remote-pubkey",
    });

    expect(localStorage.getItem("clientPubkey")).toBeNull();
    expect(localStorage.getItem("clientPrivkey")).toBeNull();
  });

  it("writes bunkerSecret alongside the other bunker keys when provided", () => {
    setLocalStorageDataOnSignIn({
      clientPubkey: "pub-abc",
      clientPrivkey: "priv-abc",
      bunkerRemotePubkey: "remote-pubkey",
      bunkerRelays: ["wss://relay.example"],
      bunkerSecret: "my-secret",
    });

    expect(localStorage.getItem("bunkerSecret")).toBe("my-secret");
  });

  it("writes signer JSON when a signer is provided", () => {
    const signer = { type: "nip07" } as any;
    setLocalStorageDataOnSignIn({ signer });
    expect(localStorage.getItem("signer")).toBe(JSON.stringify(signer));
  });

  it("writes migrationComplete=true when migrationComplete is truthy", () => {
    setLocalStorageDataOnSignIn({ migrationComplete: true });
    expect(localStorage.getItem("migrationComplete")).toBe("true");

    localStorage.clear();
    setLocalStorageDataOnSignIn({ migrationComplete: false });
    expect(localStorage.getItem("migrationComplete")).toBeNull();
  });

  it("dispatches a storage event on window", () => {
    const dispatchSpy = jest.spyOn(window, "dispatchEvent");
    setLocalStorageDataOnSignIn({});
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "storage" })
    );
  });
});

describe("publishReportEvent", () => {
  const fixedNowMs = 1_710_000_000_000;
  const fixedNowSeconds = 1_710_000_000;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem(
      "writeRelays",
      JSON.stringify(["wss://write.example"])
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps the supported NIP-56 report types in sync", () => {
    expect(REPORT_TYPES).toEqual([
      "nudity",
      "malware",
      "profanity",
      "illegal",
      "spam",
      "impersonation",
      "other",
    ]);
  });

  it("builds a valid profile report event", async () => {
    jest.spyOn(Date, "now").mockReturnValue(fixedNowMs);

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

    expect(signer.sign).toHaveBeenCalledTimes(1);
    expect(signer.sign).toHaveBeenCalledWith({
      created_at: fixedNowSeconds,
      content: "Spam account",
      kind: 1984,
      tags: [["p", "seller-pubkey", "spam"]],
    });
    expect(signedEvent).toEqual(
      expect.objectContaining({
        id: "signed-profile-report",
        kind: 1984,
        pubkey: "reporter-pubkey",
        sig: "signed-sig",
      })
    );
    expect(nostr.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "signed-profile-report",
        kind: 1984,
        tags: [["p", "seller-pubkey", "spam"]],
      }),
      expect.arrayContaining([
        "wss://write.example",
        "wss://relay.example",
        "wss://sendit.nosflare.com",
      ])
    );
    expect(cacheEventToDatabase).toHaveBeenCalledWith(
      expect.objectContaining({ id: "signed-profile-report" })
    );
  });

  it("builds a valid listing report event", async () => {
    jest.spyOn(Date, "now").mockReturnValue(fixedNowMs);

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

    expect(signer.sign).toHaveBeenCalledTimes(1);
    expect(signer.sign).toHaveBeenCalledWith({
      created_at: fixedNowSeconds,
      content: "Listing looks illegal",
      kind: 1984,
      tags: [
        ["e", "listing-event-id", "illegal"],
        ["p", "seller-pubkey"],
      ],
    });
    expect(nostr.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "signed-listing-report",
        kind: 1984,
        tags: [
          ["e", "listing-event-id", "illegal"],
          ["p", "seller-pubkey"],
        ],
      }),
      expect.arrayContaining([
        "wss://write.example",
        "wss://relay.example",
        "wss://sendit.nosflare.com",
      ])
    );
  });

  it("catches outer errors, calls console.error, and re-throws them", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const signError = new Error("Sign failed");
    const signer = { sign: jest.fn().mockRejectedValue(signError) };
    const nostr = { publish: jest.fn() };

    await expect(
      publishReportEvent(nostr as any, signer as any, {
        content: "Spam account",
        reportType: "spam",
        reportedPubkey: "seller-pubkey",
      })
    ).rejects.toThrow("Sign failed");

    expect(consoleErrorSpy).toHaveBeenCalledWith(signError);
    consoleErrorSpy.mockRestore();
  });
});

describe("publishReviewEvent", () => {
  const eventTags = [["a", "30402:seller-pubkey:listing-1"]];

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function makeSignedReviewEvent() {
    return {
      kind: 31555,
      id: "review-event-id",
      pubkey: "reviewer-pubkey",
      sig: "sig",
      content: "Great seller!",
      created_at: 1,
      tags: eventTags,
    };
  }

  it("creates a kind-31555 event, sends it, and caches it when signedEvent is truthy", async () => {
    const signedEvent = makeSignedReviewEvent();
    const signer = { sign: jest.fn().mockResolvedValue(signedEvent) };
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishReviewEvent(
      nostr as any,
      signer as any,
      "Great seller!",
      eventTags
    );

    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 31555,
        content: "Great seller!",
        tags: eventTags,
      })
    );
    expect(nostr.publish).toHaveBeenCalledWith(
      signedEvent,
      expect.arrayContaining(["wss://relay.example"])
    );
    expect(cacheEventToDatabase).toHaveBeenCalledWith(signedEvent);
  });

  it("logs console.error (fire-and-forget) when caching rejects", async () => {
    const signedEvent = makeSignedReviewEvent();
    const signer = { sign: jest.fn().mockResolvedValue(signedEvent) };
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    // First call happens inside finalizeAndSendNostrEvent (succeeds); second
    // is the explicit cache call in publishReviewEvent (rejects).
    (cacheEventToDatabase as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Cache write failed"));

    await publishReviewEvent(
      nostr as any,
      signer as any,
      "Great seller!",
      eventTags
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache review event to database:",
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });

  it("catches outer errors, calls console.error, and re-throws them", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const signError = new Error("Sign failed");
    const signer = { sign: jest.fn().mockRejectedValue(signError) };
    const nostr = { publish: jest.fn() };

    await expect(
      publishReviewEvent(
        nostr as any,
        signer as any,
        "Great seller!",
        eventTags
      )
    ).rejects.toThrow("Sign failed");

    expect(consoleErrorSpy).toHaveBeenCalledWith(signError);
    consoleErrorSpy.mockRestore();
  });
});

describe("getDefaultRelays", () => {
  it("returns a non-empty array of wss:// relay URLs", () => {
    const relays = getDefaultRelays();
    expect(relays.length).toBeGreaterThan(0);
    relays.forEach((relay) => expect(relay).toMatch(/^wss:\/\//));
  });
});

describe("getDefaultMint", () => {
  it("returns a non-empty string", () => {
    expect(getDefaultMint()).toBeTruthy();
  });
});

describe("getDefaultBlossomServer", () => {
  it("returns a non-empty string", () => {
    expect(getDefaultBlossomServer()).toBeTruthy();
  });
});

describe("getLocalUserProfileKey", () => {
  it("returns the shopstr:user-profile:<pubkey> key format", () => {
    expect(getLocalUserProfileKey("abc123")).toBe(
      "shopstr:user-profile:abc123"
    );
  });
});

describe("withBlastr", () => {
  it("appends the blastr relay when it is absent from the input list", () => {
    const result = withBlastr(["wss://relay.damus.io"]);
    expect(result).toContain("wss://sendit.nosflare.com");
    expect(result).toContain("wss://relay.damus.io");
  });

  it("does not duplicate the blastr relay when it is already present", () => {
    const input = ["wss://relay.damus.io", "wss://sendit.nosflare.com"];
    const result = withBlastr(input);
    const count = result.filter((r) => {
      try {
        return new URL(r).hostname === "sendit.nosflare.com";
      } catch {
        return false;
      }
    }).length;
    expect(count).toBe(1);
  });
});

describe("isProfileContentPopulated", () => {
  it("returns true when at least one value is non-empty", () => {
    expect(
      isProfileContentPopulated({ name: "Alice", about: "", picture: null })
    ).toBe(true);
  });

  it("returns false when all values are empty, null, or undefined", () => {
    expect(
      isProfileContentPopulated({ name: "", about: null, picture: undefined })
    ).toBe(false);
  });
});

describe("parseLocalProfileFallback", () => {
  it("returns null for null input", () => {
    expect(parseLocalProfileFallback(null)).toBeNull();
  });

  it("returns legacy format with updatedAt 0 for an object without a content key", () => {
    const raw = JSON.stringify({ name: "Alice", about: "test" });
    expect(parseLocalProfileFallback(raw)).toEqual({
      content: { name: "Alice", about: "test" },
      updatedAt: 0,
    });
  });

  it("returns the nested content and updatedAt for the current format", () => {
    const raw = JSON.stringify({ content: { name: "Bob" }, updatedAt: 12345 });
    expect(parseLocalProfileFallback(raw)).toEqual({
      content: { name: "Bob" },
      updatedAt: 12345,
    });
  });

  it("returns null and calls console.error when JSON.parse throws", () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(parseLocalProfileFallback("not-valid-json{{")).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe("createNostrDeleteEvent", () => {
  it("produces a kind-5 template with e tags for each event ID", () => {
    const event = createNostrDeleteEvent(["id-1", "id-2"], "Deletion request");
    expect(event.kind).toBe(5);
    expect(event.content).toBe("Deletion request");
    expect(event.tags).toEqual(
      expect.arrayContaining([
        ["e", "id-1"],
        ["e", "id-2"],
      ])
    );
    expect(event.tags.some((t) => t[0] === "k")).toBe(false);
  });

  it("includes a k tag when deletedKind is provided", () => {
    const event = createNostrDeleteEvent(["id-1"], "Delete listing", 30402);
    expect(event.tags).toEqual(
      expect.arrayContaining([
        ["e", "id-1"],
        ["k", "30402"],
      ])
    );
  });

  it("omits the k tag when deletedKind is undefined", () => {
    const event = createNostrDeleteEvent(["id-1"], "Delete");
    expect(event.tags.every((t) => t[0] !== "k")).toBe(true);
  });
});

describe("verifyNip05Identifier", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("returns false immediately when nip05 is an empty string", async () => {
    const result = await verifyNip05Identifier("", "some-pubkey");
    expect(result).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns false immediately when pubkey is an empty string", async () => {
    const result = await verifyNip05Identifier("user@example.com", "");
    expect(result).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns false when response.ok is false", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    const result = await verifyNip05Identifier(
      "user@example.com",
      "some-pubkey",
      { baseUrl: "https://app.example" }
    );
    expect(result).toBe(false);
  });

  it("returns true when response body contains verified: true", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ verified: true }),
    });
    const result = await verifyNip05Identifier(
      "user@example.com",
      "some-pubkey",
      { baseUrl: "https://app.example" }
    );
    expect(result).toBe(true);
  });

  it("returns false when response body contains verified: false", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ verified: false }),
    });
    const result = await verifyNip05Identifier(
      "user@example.com",
      "some-pubkey",
      { baseUrl: "https://app.example" }
    );
    expect(result).toBe(false);
  });

  it("returns false when response body is missing the verified field", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    const result = await verifyNip05Identifier(
      "user@example.com",
      "some-pubkey",
      { baseUrl: "https://app.example" }
    );
    expect(result).toBe(false);
  });

  it("uses the provided baseUrl option to construct the request URL", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ verified: true }),
    });
    await verifyNip05Identifier("user@example.com", "some-pubkey", {
      baseUrl: "https://custom.example",
    });
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/^https:\/\/custom\.example/);
    expect(calledUrl).toContain("/api/nostr/verify-nip05");
    expect(calledUrl).toContain("nip05=");
    expect(calledUrl).toContain("pubkey=");
  });

  it("returns false in an SSR context when no baseUrl is supplied", async () => {
    const originalWindow = global.window;
    (global as any).window = undefined;
    try {
      const result = await verifyNip05Identifier(
        "user@example.com",
        "some-pubkey"
      );
      expect(result).toBe(false);
    } finally {
      global.window = originalWindow;
    }
  });

  it("returns false when fetch throws", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));
    const result = await verifyNip05Identifier(
      "user@example.com",
      "some-pubkey",
      { baseUrl: "https://app.example" }
    );
    expect(result).toBe(false);
  });
});

describe("getLocalStorageData", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns getDefaultRelays() when localStorage.relays is absent", () => {
    const data = getLocalStorageData();
    expect(data.relays).toEqual(getDefaultRelays());
  });

  it("returns getDefaultRelays() when the stored relays value is an empty array", () => {
    localStorage.setItem("relays", JSON.stringify([]));
    const data = getLocalStorageData();
    expect(data.relays).toEqual(getDefaultRelays());
  });

  it("filters falsy entries from the stored relays array", () => {
    localStorage.setItem(
      "relays",
      JSON.stringify(["wss://relay.damus.io", "", "wss://nos.lol", ""])
    );
    const data = getLocalStorageData();
    expect(data.relays).toEqual(["wss://relay.damus.io", "wss://nos.lol"]);
  });

  it("removes legacy keys when signInMethod is present in localStorage", () => {
    localStorage.setItem("signInMethod", "extension");
    localStorage.setItem("npub", "npub1abc");
    localStorage.setItem("signIn", "extension");
    localStorage.setItem("chats", "[]");
    localStorage.setItem("cashuWalletRelays", "[]");

    getLocalStorageData();

    expect(localStorage.getItem("npub")).toBeNull();
    expect(localStorage.getItem("signIn")).toBeNull();
    expect(localStorage.getItem("chats")).toBeNull();
    expect(localStorage.getItem("cashuWalletRelays")).toBeNull();
  });

  it("returns the stored relay array when it is non-empty and valid", () => {
    const myRelays = ["wss://relay.example", "wss://relay2.example"];
    localStorage.setItem("relays", JSON.stringify(myRelays));
    const data = getLocalStorageData();
    expect(data.relays).toEqual(myRelays);
  });

  it("returns the default mint when mints is empty and writes it back to localStorage", () => {
    localStorage.setItem("mints", JSON.stringify([]));
    const data = getLocalStorageData();
    expect(data.mints).toEqual([getDefaultMint()]);
    expect(localStorage.getItem("mints")).toBe(
      JSON.stringify([getDefaultMint()])
    );
  });

  it("returns stored mints when the array is non-empty", () => {
    const myMints = ["https://mint.example/cashu"];
    localStorage.setItem("mints", JSON.stringify(myMints));
    const data = getLocalStorageData();
    expect(data.mints).toEqual(myMints);
  });

  it("returns the default blossom server when blossomServers is empty", () => {
    localStorage.setItem("blossomServers", JSON.stringify([]));
    const data = getLocalStorageData();
    expect(data.blossomServers).toEqual([getDefaultBlossomServer()]);
  });

  it("initialises tokens to [] in localStorage when the key is absent", () => {
    getLocalStorageData();
    expect(localStorage.getItem("tokens")).toBe("[]");
  });

  it("initialises history to [] in localStorage when the key is absent", () => {
    getLocalStorageData();
    expect(localStorage.getItem("history")).toBe("[]");
  });

  it("parses wot as a number and defaults to 3 when absent", () => {
    expect(getLocalStorageData().wot).toBe(3);
    localStorage.setItem("wot", "7");
    expect(getLocalStorageData().wot).toBe(7);
  });

  it("returns null for nwcString and nwcInfo when the keys are absent", () => {
    const data = getLocalStorageData();
    expect(data.nwcString).toBeNull();
    expect(data.nwcInfo).toBeNull();
  });

  it("returns the stored nwcString when present", () => {
    localStorage.setItem(
      "nwcString",
      "nostr+walletconnect://pubkey?relay=wss://relay.example"
    );
    const data = getLocalStorageData();
    expect(data.nwcString).toBe(
      "nostr+walletconnect://pubkey?relay=wss://relay.example"
    );
  });

  it("returns the parsed savedAddresses array", () => {
    const addresses = [
      {
        id: "addr-1",
        label: "Home",
        name: "Alice",
        address: "123 Main St",
        city: "Springfield",
        state: "IL",
        zip: "62701",
        country: "US",
        isDefault: true,
      },
    ];
    localStorage.setItem("savedAddresses", JSON.stringify(addresses));
    const data = getLocalStorageData();
    expect(data.savedAddresses).toEqual(addresses);
  });

  it("accepts { type: 'nip07' } as a valid stored signer", () => {
    localStorage.setItem("signer", JSON.stringify({ type: "nip07" }));
    expect(getLocalStorageData().signer).toEqual({ type: "nip07" });
  });

  it("accepts { type: 'nip46', bunker: '...' } as a valid stored signer", () => {
    const storedSigner = {
      type: "nip46",
      bunker: "bunker://pubkey?relay=wss://relay.example",
    };
    localStorage.setItem("signer", JSON.stringify(storedSigner));
    expect(getLocalStorageData().signer).toEqual(storedSigner);
  });

  it("rejects { type: 'nip46' } missing bunker and falls through to migration", () => {
    localStorage.setItem("signer", JSON.stringify({ type: "nip46" }));
    localStorage.setItem("signInMethod", "extension");
    expect(getLocalStorageData().signer).toEqual({ type: "nip07" });
  });

  it("accepts { type: 'nsec', encryptedPrivKey: '...' } as a valid stored signer", () => {
    const storedSigner = { type: "nsec", encryptedPrivKey: "enc-key-abc" };
    localStorage.setItem("signer", JSON.stringify(storedSigner));
    expect(getLocalStorageData().signer).toEqual(storedSigner);
  });

  it("rejects { type: 'nsec' } missing encryptedPrivKey and falls through to migration", () => {
    localStorage.setItem("signer", JSON.stringify({ type: "nsec" }));
    localStorage.setItem("signInMethod", "extension");
    expect(getLocalStorageData().signer).toEqual({ type: "nip07" });
  });

  it("rejects non-object signer values and falls through to migration", () => {
    localStorage.setItem("signInMethod", "extension");
    for (const invalid of [null, [], "a-string"]) {
      localStorage.setItem("signer", JSON.stringify(invalid));
      expect(getLocalStorageData().signer).toEqual({ type: "nip07" });
    }
  });

  it("reconstructs { type: 'nip07' } from signInMethod=extension when no stored signer", () => {
    localStorage.setItem("signInMethod", "extension");
    expect(getLocalStorageData().signer).toEqual({ type: "nip07" });
  });

  it("reconstructs { type: 'nip46', bunker, appPrivKey } from signInMethod=bunker keys", () => {
    localStorage.setItem("signInMethod", "bunker");
    localStorage.setItem("bunkerRemotePubkey", "remote-pubkey");
    localStorage.setItem("bunkerSecret", "my-secret");
    localStorage.setItem(
      "bunkerRelays",
      JSON.stringify(["wss://relay.example"])
    );
    localStorage.setItem("clientPrivkey", "privkey-abc");

    expect(getLocalStorageData().signer).toEqual({
      type: "nip46",
      bunker:
        "bunker://remote-pubkey?secret=my-secret&relay=wss://relay.example",
      appPrivKey: "privkey-abc",
    });
  });

  it("reconstructs { type: 'nsec', encryptedPrivKey } from signInMethod=nsec when encryptedPrivateKey is a string", () => {
    localStorage.setItem("signInMethod", "nsec");
    localStorage.setItem("encryptedPrivateKey", "enc-priv-key-abc");

    expect(getLocalStorageData().signer).toEqual({
      type: "nsec",
      encryptedPrivKey: "enc-priv-key-abc",
    });
  });

  it("leaves signer undefined when signInMethod=nsec but encryptedPrivateKey is absent", () => {
    localStorage.setItem("signInMethod", "nsec");

    expect(getLocalStorageData().signer).toBeUndefined();
  });
});

describe("constructMessageSeal", () => {
  const getConvKeyMock = nip44.getConversationKey as jest.Mock;
  const encryptMock = nip44.encrypt as jest.Mock;
  const finalizeEventMock = finalizeEvent as jest.Mock;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("uses nip44.getConversationKey + nip44.encrypt + finalizeEvent when randomPrivkey is provided", async () => {
    const fakeConvKey = new Uint8Array(32).fill(1);
    getConvKeyMock.mockReturnValue(fakeConvKey);
    encryptMock.mockReturnValue("encrypted-content");

    const randomPrivkey = new Uint8Array(32).fill(2);
    const messageEvent = {
      kind: 14,
      content: "hello",
      tags: [],
      pubkey: "sender",
      created_at: 1,
      id: "msg-id",
      sig: "sig",
    };
    const signer = { encrypt: jest.fn(), sign: jest.fn() };

    const result = await constructMessageSeal(
      signer as any,
      messageEvent as any,
      "sender-pubkey",
      "recipient-pubkey",
      randomPrivkey
    );

    expect(getConvKeyMock).toHaveBeenCalledWith(
      randomPrivkey,
      "recipient-pubkey"
    );
    expect(encryptMock).toHaveBeenCalledWith(
      JSON.stringify(messageEvent),
      fakeConvKey
    );
    expect(finalizeEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 13 }),
      randomPrivkey
    );
    expect(result.kind).toBe(13);
  });

  it("uses signer.encrypt + signer.sign and returns kind-13 when randomPrivkey is absent", async () => {
    const signer = {
      encrypt: jest.fn().mockResolvedValue("signer-encrypted-content"),
      sign: jest.fn().mockImplementation(async (event: any) => ({
        ...event,
        id: "seal-id",
        sig: "seal-sig",
      })),
    };
    const messageEvent = {
      kind: 14,
      content: "hello",
      tags: [],
      pubkey: "sender",
      created_at: 1,
      id: "msg-id",
      sig: "sig",
    };

    const result = await constructMessageSeal(
      signer as any,
      messageEvent as any,
      "sender-pubkey",
      "recipient-pubkey"
    );

    expect(signer.encrypt).toHaveBeenCalledWith(
      "recipient-pubkey",
      JSON.stringify(messageEvent)
    );
    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 13, content: "signer-encrypted-content" })
    );
    expect(result.kind).toBe(13);
  });
});

describe("constructMessageGiftWrap", () => {
  const relay = "wss://relay.example";
  const sealEvent = {
    kind: 13,
    id: "seal-id",
    sig: "seal-sig",
    content: "seal-content",
    pubkey: "sender-pubkey",
    created_at: 1,
    tags: [],
  };
  const randomPrivkey = new Uint8Array(32).fill(4);
  const fakeConvKey = new Uint8Array(32).fill(3);
  const getConvKeyMock = nip44.getConversationKey as jest.Mock;
  const encryptMock = nip44.encrypt as jest.Mock;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify([relay]));
    getConvKeyMock.mockReturnValue(fakeConvKey);
    encryptMock.mockReturnValue("wrapped-content");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns a kind-1059 event", async () => {
    const result = await constructMessageGiftWrap(
      sealEvent as any,
      "random-pubkey",
      randomPrivkey,
      "recipient-pubkey"
    );
    expect(result.kind).toBe(1059);
  });

  it("includes a p tag for the recipient and the first stored relay", async () => {
    const result = await constructMessageGiftWrap(
      sealEvent as any,
      "random-pubkey",
      randomPrivkey,
      "recipient-pubkey"
    );
    expect(result.tags).toContainEqual(["p", "recipient-pubkey", relay]);
  });

  it("encrypts the seal using the random conversation key", async () => {
    await constructMessageGiftWrap(
      sealEvent as any,
      "random-pubkey",
      randomPrivkey,
      "recipient-pubkey"
    );
    expect(getConvKeyMock).toHaveBeenCalledWith(
      randomPrivkey,
      "recipient-pubkey"
    );
    expect(encryptMock).toHaveBeenCalledWith(
      JSON.stringify(sealEvent),
      fakeConvKey
    );
  });
});

describe("saveNWCString", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it("writes nwcString to localStorage when given a non-empty string", () => {
    saveNWCString("nostr+walletconnect://pubkey?relay=wss://relay.example");
    expect(localStorage.getItem("nwcString")).toBe(
      "nostr+walletconnect://pubkey?relay=wss://relay.example"
    );
  });

  it("removes both nwcString and nwcInfo from localStorage when given an empty string", () => {
    localStorage.setItem("nwcString", "some-value");
    localStorage.setItem("nwcInfo", "some-info");

    saveNWCString("");

    expect(localStorage.getItem("nwcString")).toBeNull();
    expect(localStorage.getItem("nwcInfo")).toBeNull();
  });

  it("dispatches a storage event on window", () => {
    const dispatchSpy = jest.spyOn(window, "dispatchEvent");
    saveNWCString("nostr+walletconnect://pubkey");
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "storage" })
    );
  });
});

describe("LogOut", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("removes all keys in LOCALSTORAGECONSTANTS from localStorage", () => {
    const constantKeys = [
      "signInMethod",
      "userNPub",
      "userPubkey",
      "encryptedPrivateKey",
      "relays",
      "readRelays",
      "writeRelays",
      "mints",
      "blossomServers",
      "tokens",
      "history",
      "wot",
      "clientPubkey",
      "clientPrivkey",
      "bunkerRemotePubkey",
      "bunkerRelays",
      "bunkerSecret",
      "signer",
      "nwcString",
      "nwcInfo",
      "savedAddresses",
    ];
    constantKeys.forEach((k) => localStorage.setItem(k, "value"));

    LogOut();

    constantKeys.forEach((k) => expect(localStorage.getItem(k)).toBeNull());
  });

  it("also removes the legacy keys npub, signIn, and chats", () => {
    localStorage.setItem("npub", "npub1abc");
    localStorage.setItem("signIn", "extension");
    localStorage.setItem("chats", "[]");

    LogOut();

    expect(localStorage.getItem("npub")).toBeNull();
    expect(localStorage.getItem("signIn")).toBeNull();
    expect(localStorage.getItem("chats")).toBeNull();
  });

  it("dispatches a storage event on window", () => {
    const dispatchSpy = jest.spyOn(window, "dispatchEvent");

    LogOut();

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "storage" })
    );
    dispatchSpy.mockRestore();
  });
});

describe("sendGiftWrappedMessageEvent", () => {
  const giftWrappedEvent = {
    id: "wrap-id",
    kind: 1059,
    pubkey: "sender-pubkey",
    created_at: 1,
    content: "encrypted",
    sig: "sig",
    tags: [["p", "recipient-pubkey"]],
  };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem(
      "writeRelays",
      JSON.stringify(["wss://write.example"])
    );
    (cacheEventToDatabase as jest.Mock).mockClear();
    (newPromiseWithTimeout as jest.Mock).mockClear();
    (trackFailedRelayPublish as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("calls cacheEventToDatabase before any relay publish attempt", async () => {
    const callOrder: string[] = [];
    (cacheEventToDatabase as jest.Mock).mockImplementation(async () => {
      callOrder.push("cache");
    });
    const nostr = {
      publish: jest.fn().mockImplementation(async () => {
        callOrder.push("publish");
      }),
    };
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise<void>((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });

    await sendGiftWrappedMessageEvent(nostr as any, giftWrappedEvent as any);

    expect(cacheEventToDatabase).toHaveBeenCalledWith(giftWrappedEvent);
    expect(callOrder.indexOf("cache")).toBeLessThan(
      callOrder.indexOf("publish")
    );
  });

  it("calls nostr.publish inside the timeout wrapper", async () => {
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise<void>((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });

    await sendGiftWrappedMessageEvent(nostr as any, giftWrappedEvent as any);

    expect(newPromiseWithTimeout).toHaveBeenCalled();
    expect(nostr.publish).toHaveBeenCalledWith(
      giftWrappedEvent,
      expect.arrayContaining(["wss://relay.example", "wss://write.example"])
    );
  });

  it("calls console.warn and trackFailedRelayPublish with signer when newPromiseWithTimeout rejects", async () => {
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const signer = { sign: jest.fn() };
    const nostr = { publish: jest.fn() };
    (newPromiseWithTimeout as jest.Mock).mockRejectedValue(
      new Error("Timeout")
    );

    await sendGiftWrappedMessageEvent(
      nostr as any,
      giftWrappedEvent as any,
      signer as any
    );

    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(trackFailedRelayPublish).toHaveBeenCalledWith(
      giftWrappedEvent.id,
      giftWrappedEvent,
      expect.arrayContaining(["wss://relay.example", "wss://write.example"]),
      signer
    );
    consoleWarnSpy.mockRestore();
  });

  it("calls trackFailedRelayPublish with undefined signer when signer parameter is omitted", async () => {
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const nostr = { publish: jest.fn() };
    (newPromiseWithTimeout as jest.Mock).mockRejectedValue(
      new Error("Timeout")
    );

    await sendGiftWrappedMessageEvent(nostr as any, giftWrappedEvent as any);

    expect(trackFailedRelayPublish).toHaveBeenCalledWith(
      giftWrappedEvent.id,
      giftWrappedEvent,
      expect.any(Array),
      undefined
    );
    consoleWarnSpy.mockRestore();
  });
});

describe("deleteEvent", () => {
  const eventIds = ["event-id-1", "event-id-2"];

  function makeSigner() {
    return {
      sign: jest.fn().mockImplementation(async (event: any) => ({
        ...event,
        id: "signed-id",
        pubkey: "signer-pubkey",
        sig: "sig",
      })),
      getPubKey: jest.fn().mockResolvedValue("signer-pubkey"),
    };
  }

  function makeNostr() {
    return { publish: jest.fn().mockResolvedValue(undefined) };
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (deleteEventsFromDatabase as jest.Mock).mockResolvedValue(undefined);
    (buildDeleteCachedEventsProof as jest.Mock).mockReturnValue({});
    (buildSignedHttpRequestProofTemplate as jest.Mock).mockReturnValue({
      kind: 27235,
      content: "",
      tags: [],
      created_at: 0,
    });
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates a kind-5 deletion event via createNostrDeleteEvent and sends it", async () => {
    const signer = makeSigner();
    const nostr = makeNostr();

    await deleteEvent(nostr as any, signer as any, eventIds);

    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 5 })
    );
    expect(cacheEventToDatabase).toHaveBeenCalled();
  });

  it("calls signer.getPubKey to obtain the pubkey for the proof", async () => {
    const signer = makeSigner();
    const nostr = makeNostr();

    await deleteEvent(nostr as any, signer as any, eventIds);

    expect(signer.getPubKey).toHaveBeenCalledTimes(1);
  });

  it("calls deleteEventsFromDatabase with the event IDs and signed proof", async () => {
    const signer = makeSigner();
    const nostr = makeNostr();

    await deleteEvent(nostr as any, signer as any, eventIds);

    expect(deleteEventsFromDatabase).toHaveBeenCalledWith(
      eventIds,
      expect.objectContaining({ id: "signed-id", sig: "sig" })
    );
  });

  it("logs console.error and continues when deleteEventsFromDatabase rejects", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const signer = makeSigner();
    const nostr = makeNostr();
    (deleteEventsFromDatabase as jest.Mock).mockRejectedValue(
      new Error("DB error")
    );

    await expect(
      deleteEvent(nostr as any, signer as any, eventIds)
    ).resolves.toBeUndefined();

    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to delete events from database"),
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });
});

describe("createNostrProfileEvent", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("calls finalizeAndSendNostrEvent with { waitForRelayPublish: false } and returns the signed event", async () => {
    const signedEvent = {
      kind: 0,
      id: "profile-event-id",
      pubkey: "user-pubkey",
      sig: "sig",
      content: '{"name":"Alice"}',
      created_at: 1,
      tags: [],
    };
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };
    const signer = { sign: jest.fn().mockResolvedValue(signedEvent) };

    // A never-resolving timeout proves the function does not await relay publish
    (newPromiseWithTimeout as jest.Mock).mockReturnValue(new Promise(() => {}));

    const result = await createNostrProfileEvent(
      nostr as any,
      signer as any,
      '{"name":"Alice"}'
    );

    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 0, content: '{"name":"Alice"}' })
    );
    expect(result).toEqual(signedEvent);
  });
});

describe("publishWalletEvent", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("publishes an encrypted NIP-60 wallet event with explicit mints", async () => {
    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const cashuPrivkey =
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const mint = "https://mint.example";
    const walletContent = JSON.stringify([
      ["privkey", cashuPrivkey],
      ["mint", mint],
    ]);
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      encrypt: jest
        .fn()
        .mockImplementation(async (_pubkey: string, content: string) => {
          return `encrypted:${content}`;
        }),
      sign: jest.fn().mockImplementation(async (event: any) => ({
        ...event,
        id: "wallet-event-id",
        pubkey: userPubkey,
        sig: "sig",
      })),
    };
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishWalletEvent(
      nostr as any,
      signer as any,
      { cashuPubkey: userPubkey, cashuPrivkey },
      { mints: [mint] }
    );

    expect(signer.encrypt).toHaveBeenCalledWith(userPubkey, walletContent);
    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 17375,
        tags: [],
        content: `encrypted:${walletContent}`,
      })
    );
    expect(nostr.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "wallet-event-id",
        kind: 17375,
        content: `encrypted:${walletContent}`,
      }),
      expect.arrayContaining(["wss://relay.example"])
    );
  });

  it("deduplicates mints via Set, creates a kind-17375 event, and caches it when signedEvent is truthy", async () => {
    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const cashuPrivkey =
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      encrypt: jest
        .fn()
        .mockImplementation(async (_pubkey: string, content: string) => {
          return `encrypted:${content}`;
        }),
      sign: jest.fn().mockImplementation(async (event: any) => ({
        ...event,
        id: "wallet-event-id",
        pubkey: userPubkey,
        sig: "sig",
      })),
    };
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishWalletEvent(
      nostr as any,
      signer as any,
      { cashuPrivkey },
      { mints: ["https://mint.a", "https://mint.a", "https://mint.b"] }
    );

    const expectedContent = JSON.stringify([
      ["privkey", cashuPrivkey],
      ["mint", "https://mint.a"],
      ["mint", "https://mint.b"],
    ]);
    expect(signer.encrypt).toHaveBeenCalledWith(userPubkey, expectedContent);
    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 17375 })
    );
    expect(cacheEventToDatabase).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 17375, id: "wallet-event-id" })
    );
  });

  it("logs console.error when caching rejects", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const userPubkey =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const cashuPrivkey =
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      encrypt: jest
        .fn()
        .mockImplementation(async (_pubkey: string, content: string) => {
          return `encrypted:${content}`;
        }),
      sign: jest.fn().mockImplementation(async (event: any) => ({
        ...event,
        id: "wallet-event-id",
        pubkey: userPubkey,
        sig: "sig",
      })),
    };
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };
    // First call inside finalizeAndSendNostrEvent succeeds; second explicit call rejects.
    (cacheEventToDatabase as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Cache write failed"));

    await publishWalletEvent(
      nostr as any,
      signer as any,
      { cashuPrivkey },
      { mints: ["https://mint.example"] }
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache wallet event to database:",
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });

  it("returns silently on any inner error", async () => {
    const signer = {
      getPubKey: jest.fn().mockRejectedValue(new Error("Signer unavailable")),
      encrypt: jest.fn(),
      sign: jest.fn(),
    };
    const nostr = { publish: jest.fn() };

    await expect(
      publishWalletEvent(nostr as any, signer as any, {
        cashuPrivkey: "b".repeat(64),
      })
    ).resolves.toBeUndefined();
  });
});

describe("PostListing", () => {
  const values: ProductFormValues = [["summary", "A great product"]];

  function makeSigner() {
    return {
      sign: jest.fn().mockImplementation(async (tpl: any) => ({
        ...tpl,
        id: `signed-${tpl.kind}`,
        pubkey: "user-pubkey",
        sig: "sig",
      })),
      getPubKey: jest.fn().mockResolvedValue("user-pubkey"),
    };
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws "Login required" when isLoggedIn is false', async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await expect(
      PostListing(values, signer as any, false, nostr as any)
    ).rejects.toThrow("Login required");
  });

  it('throws "Login required" when signer is falsy', async () => {
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await expect(
      PostListing(values, undefined as any, true, nostr as any)
    ).rejects.toThrow("Login required");
  });

  it('throws "Nostr writer required" when nostr is falsy', async () => {
    const signer = makeSigner();

    await expect(
      PostListing(values, signer as any, true, undefined as any)
    ).rejects.toThrow("Nostr writer required");
  });

  it("creates and sends kind-30402, kind-31990, and kind-31989 events", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await PostListing(values, signer as any, true, nostr as any);

    const signedKinds = (signer.sign as jest.Mock).mock.calls.map(
      (call) => call[0].kind
    );
    expect(signedKinds).toEqual([30402, 31989, 31990]);
    expect(nostr.publish).toHaveBeenCalledTimes(3);
  });

  it("returns the signed listing event", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await PostListing(values, signer as any, true, nostr as any);

    expect(result).toEqual(
      expect.objectContaining({ kind: 30402, id: "signed-30402" })
    );
  });
});

describe("createNostrShopEvent", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function makeSignedShopEvent() {
    return {
      kind: 30019,
      id: "shop-event-id",
      pubkey: "user-pubkey",
      sig: "sig",
      content: '{"name":"My Shop"}',
      created_at: 1,
      tags: [["d", "user-pubkey"]],
    };
  }

  it("creates a kind-30019 event and caches it when signedEvent is truthy", async () => {
    const signedEvent = makeSignedShopEvent();
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("user-pubkey"),
      sign: jest.fn().mockResolvedValue(signedEvent),
    };
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await createNostrShopEvent(
      nostr as any,
      signer as any,
      '{"name":"My Shop"}'
    );

    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 30019,
        content: '{"name":"My Shop"}',
        tags: [["d", "user-pubkey"]],
      })
    );
    expect(cacheEventToDatabase).toHaveBeenCalledWith(signedEvent);
  });

  it("logs console.error (fire-and-forget) when cacheEventToDatabase rejects", async () => {
    const signedEvent = makeSignedShopEvent();
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("user-pubkey"),
      sign: jest.fn().mockResolvedValue(signedEvent),
    };
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    // First call happens inside finalizeAndSendNostrEvent (succeeds); second
    // is the explicit cache call in createNostrShopEvent (rejects).
    (cacheEventToDatabase as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Cache write failed"));

    await createNostrShopEvent(
      nostr as any,
      signer as any,
      '{"name":"My Shop"}'
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache shop profile event to database:",
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });
});

describe("createNostrRelayEvent", () => {
  function makeSigner() {
    return {
      sign: jest.fn().mockImplementation(async (tpl: any) => ({
        ...tpl,
        id: "signed-relay-event",
        pubkey: "user-pubkey",
        sig: "sig",
      })),
    };
  }

  beforeEach(() => {
    localStorage.clear();
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('always adds ["r", relay] tags for each relay in the default list', async () => {
    localStorage.setItem(
      "relays",
      JSON.stringify(["wss://relay.example", "wss://relay2.example"])
    );
    localStorage.setItem("readRelays", JSON.stringify([]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await createNostrRelayEvent(nostr as any, signer as any);

    expect(result.kind).toBe(10002);
    expect(result.tags).toContainEqual(["r", "wss://relay.example"]);
    expect(result.tags).toContainEqual(["r", "wss://relay2.example"]);
  });

  it('adds ["r", relay, "read"] tags when readRelays is non-empty', async () => {
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("readRelays", JSON.stringify(["wss://read.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await createNostrRelayEvent(nostr as any, signer as any);

    expect(result.tags).toContainEqual(["r", "wss://read.example", "read"]);
  });

  it('adds ["r", relay, "write"] tags when writeRelays is non-empty', async () => {
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("readRelays", JSON.stringify([]));
    localStorage.setItem(
      "writeRelays",
      JSON.stringify(["wss://write.example"])
    );
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await createNostrRelayEvent(nostr as any, signer as any);

    expect(result.tags).toContainEqual(["r", "wss://write.example", "write"]);
  });

  it("omits read/write directional tags when both lists are empty", async () => {
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("readRelays", JSON.stringify([]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await createNostrRelayEvent(nostr as any, signer as any);

    expect(result.tags.every((t) => t.length === 2)).toBe(true);
  });
});

describe("publishRelayEvent", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates a kind-10002 event with r tags and caches it when signedEvent is truthy", async () => {
    const relays = ["wss://relay1.example", "wss://relay2.example"];
    const signedEvent = {
      kind: 10002,
      id: "relay-event-id",
      pubkey: "user-pubkey",
      sig: "sig",
      content: "",
      created_at: 1,
      tags: relays.map((r) => ["r", r]),
    };
    const signer = { sign: jest.fn().mockResolvedValue(signedEvent) };
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishRelayEvent(nostr as any, signer as any, relays);

    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 10002,
        tags: expect.arrayContaining([
          ["r", "wss://relay1.example"],
          ["r", "wss://relay2.example"],
        ]),
      })
    );
    expect(cacheEventToDatabase).toHaveBeenCalledWith(signedEvent);
  });

  it("logs console.error when caching rejects", async () => {
    const relays = ["wss://relay.example"];
    const signedEvent = {
      kind: 10002,
      id: "relay-event-id",
      pubkey: "user-pubkey",
      sig: "sig",
      content: "",
      created_at: 1,
      tags: [["r", "wss://relay.example"]],
    };
    const signer = { sign: jest.fn().mockResolvedValue(signedEvent) };
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    // First call happens inside finalizeAndSendNostrEvent (succeeds); second
    // is the explicit cache call in publishRelayEvent (rejects).
    (cacheEventToDatabase as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Cache write failed"));

    await publishRelayEvent(nostr as any, signer as any, relays);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache relay list event to database:",
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });
});

describe("createBlossomServerEvent", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates a kind-10063 event with one server tag per configured blossom server", async () => {
    localStorage.setItem(
      "blossomServers",
      JSON.stringify(["https://blossom1.example", "https://blossom2.example"])
    );
    const signer = {
      sign: jest.fn().mockImplementation(async (tpl: any) => ({
        ...tpl,
        id: "blossom-event-id",
        pubkey: "user-pubkey",
        sig: "sig",
      })),
    };
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await createBlossomServerEvent(nostr as any, signer as any);

    expect(result.kind).toBe(10063);
    expect(result.tags).toHaveLength(2);
    expect(result.tags).toEqual(
      expect.arrayContaining([
        ["server", "https://blossom1.example"],
        ["server", "https://blossom2.example"],
      ])
    );
  });
});

describe("finalizeAndSendNostrEvent", () => {
  const eventTemplate = {
    kind: 1,
    content: "test content",
    tags: [] as string[][],
    created_at: 1,
  };

  function makeSignedEvent(overrides: Record<string, unknown> = {}) {
    return {
      ...eventTemplate,
      id: "signed-event-id",
      pubkey: "user-pubkey",
      sig: "sig",
      ...overrides,
    };
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("signs the event, then awaits cacheEventToDatabase before publishing", async () => {
    const callOrder: string[] = [];
    const signedEvent = makeSignedEvent();
    const signer = {
      sign: jest.fn().mockImplementation(async () => {
        callOrder.push("sign");
        return signedEvent;
      }),
    };
    (cacheEventToDatabase as jest.Mock).mockImplementation(async () => {
      callOrder.push("cache");
    });
    const nostr = {
      publish: jest.fn().mockImplementation(async () => {
        callOrder.push("publish");
      }),
    };

    await finalizeAndSendNostrEvent(signer as any, nostr as any, eventTemplate);

    expect(signer.sign).toHaveBeenCalledWith(eventTemplate);
    expect(cacheEventToDatabase).toHaveBeenCalledWith(signedEvent);
    expect(callOrder).toEqual(["sign", "cache", "publish"]);
  });

  it("returns the signed event and awaits relay publish in the default path", async () => {
    const signedEvent = makeSignedEvent();
    const signer = { sign: jest.fn().mockResolvedValue(signedEvent) };
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await finalizeAndSendNostrEvent(
      signer as any,
      nostr as any,
      eventTemplate
    );

    expect(result).toEqual(signedEvent);
    expect(nostr.publish).toHaveBeenCalledWith(
      signedEvent,
      expect.arrayContaining(["wss://relay.example"])
    );
  });

  it("returns the signed event immediately and fires publish without awaiting when waitForRelayPublish is false", async () => {
    const signedEvent = makeSignedEvent();
    const signer = { sign: jest.fn().mockResolvedValue(signedEvent) };
    const nostr = { publish: jest.fn() };

    // Never-resolving timeout: if the function awaited it, the test would hang
    (newPromiseWithTimeout as jest.Mock).mockReturnValue(new Promise(() => {}));

    const result = await finalizeAndSendNostrEvent(
      signer as any,
      nostr as any,
      eventTemplate,
      { waitForRelayPublish: false }
    );

    expect(result).toEqual(signedEvent);
    expect(cacheEventToDatabase).toHaveBeenCalledWith(signedEvent);
    expect(newPromiseWithTimeout).toHaveBeenCalled();
  });

  it("re-throws when signer.sign rejects", async () => {
    const signError = new Error("Sign failed");
    const signer = { sign: jest.fn().mockRejectedValue(signError) };
    const nostr = { publish: jest.fn() };

    await expect(
      finalizeAndSendNostrEvent(signer as any, nostr as any, eventTemplate)
    ).rejects.toThrow("Sign failed");

    expect(cacheEventToDatabase).not.toHaveBeenCalled();
    expect(nostr.publish).not.toHaveBeenCalled();
  });

  it("re-throws when cacheEventToDatabase rejects", async () => {
    const cacheError = new Error("Cache write failed");
    const signedEvent = makeSignedEvent();
    const signer = { sign: jest.fn().mockResolvedValue(signedEvent) };
    const nostr = { publish: jest.fn() };
    (cacheEventToDatabase as jest.Mock).mockRejectedValue(cacheError);

    await expect(
      finalizeAndSendNostrEvent(signer as any, nostr as any, eventTemplate)
    ).rejects.toThrow("Cache write failed");

    expect(nostr.publish).not.toHaveBeenCalled();
  });

  // publishEventWithRetryTracking (private, exercised through finalizeAndSendNostrEvent)

  it("calls nostr.publish via newPromiseWithTimeout and returns cleanly on success", async () => {
    const signedEvent = makeSignedEvent();
    const signer = { sign: jest.fn().mockResolvedValue(signedEvent) };
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    await finalizeAndSendNostrEvent(signer as any, nostr as any, eventTemplate);

    expect(newPromiseWithTimeout).toHaveBeenCalled();
    expect(nostr.publish).toHaveBeenCalledWith(
      signedEvent,
      expect.arrayContaining(["wss://relay.example"])
    );
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(trackFailedRelayPublish).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it("logs console.warn and calls trackFailedRelayPublish when newPromiseWithTimeout rejects", async () => {
    const signedEvent = makeSignedEvent();
    const signer = { sign: jest.fn().mockResolvedValue(signedEvent) };
    const nostr = { publish: jest.fn() };
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    (newPromiseWithTimeout as jest.Mock).mockRejectedValue(
      new Error("Timeout")
    );

    await finalizeAndSendNostrEvent(signer as any, nostr as any, eventTemplate);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("timed out or failed"),
      expect.any(Error)
    );
    expect(trackFailedRelayPublish).toHaveBeenCalledWith(
      signedEvent.id,
      signedEvent,
      expect.any(Array),
      signer
    );

    consoleWarnSpy.mockRestore();
  });

  it("swallows trackFailedRelayPublish rejections via .catch(console.error)", async () => {
    const trackError = new Error("Track failed");
    (trackFailedRelayPublish as jest.Mock).mockRejectedValue(trackError);
    const signedEvent = makeSignedEvent();
    const signer = { sign: jest.fn().mockResolvedValue(signedEvent) };
    const nostr = { publish: jest.fn() };
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    (newPromiseWithTimeout as jest.Mock).mockRejectedValue(
      new Error("Timeout")
    );

    const result = await finalizeAndSendNostrEvent(
      signer as any,
      nostr as any,
      eventTemplate
    );

    expect(result).toEqual(signedEvent);
    expect(consoleErrorSpy).toHaveBeenCalledWith(trackError);

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("logs console.error and resolves when an unexpected error occurs in the retry tracking flow", async () => {
    const unexpectedError = new Error("Unexpected warn error");
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {
        throw unexpectedError;
      });
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const signedEvent = makeSignedEvent();
    const signer = { sign: jest.fn().mockResolvedValue(signedEvent) };
    const nostr = { publish: jest.fn() };
    (newPromiseWithTimeout as jest.Mock).mockRejectedValue(
      new Error("Timeout")
    );

    const result = await finalizeAndSendNostrEvent(
      signer as any,
      nostr as any,
      eventTemplate
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to publish signed Nostr event:",
      unexpectedError
    );
    expect(result).toEqual(signedEvent);

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});

describe("publishBlossomServerEvent", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates a kind-10063 event with server tags and caches it when signedEvent is truthy", async () => {
    const servers = ["https://blossom1.example", "https://blossom2.example"];
    const signedEvent = {
      kind: 10063,
      id: "blossom-event-id",
      pubkey: "user-pubkey",
      sig: "sig",
      content: "",
      created_at: 1,
      tags: servers.map((s) => ["server", s]),
    };
    const signer = { sign: jest.fn().mockResolvedValue(signedEvent) };
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishBlossomServerEvent(nostr as any, signer as any, servers);

    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 10063,
        tags: expect.arrayContaining([
          ["server", "https://blossom1.example"],
          ["server", "https://blossom2.example"],
        ]),
      })
    );
    expect(cacheEventToDatabase).toHaveBeenCalledWith(signedEvent);
  });

  it("logs console.error (fire-and-forget) when caching rejects", async () => {
    const servers = ["https://blossom.example"];
    const signedEvent = {
      kind: 10063,
      id: "blossom-event-id",
      pubkey: "user-pubkey",
      sig: "sig",
      content: "",
      created_at: 1,
      tags: [["server", "https://blossom.example"]],
    };
    const signer = { sign: jest.fn().mockResolvedValue(signedEvent) };
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    // First call is inside finalizeAndSendNostrEvent (succeeds); second is the
    // explicit cache call in publishBlossomServerEvent (rejects).
    (cacheEventToDatabase as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Cache write failed"));

    await publishBlossomServerEvent(nostr as any, signer as any, servers);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache blossom server event to database:",
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });
});

describe("publishSavedForLaterEvent", () => {
  const userPubkey =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const product = { pubkey: "seller-pubkey", d: "listing-1" } as any;

  function makeSigner(encryptedResult = "encrypted-content") {
    return {
      encrypt: jest.fn().mockResolvedValue(encryptedResult),
      sign: jest.fn().mockImplementation(async (tpl: any) => ({
        ...tpl,
        id: "saved-event-id",
        pubkey: userPubkey,
        sig: "sig",
      })),
    };
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("filters out the exact product address when quantity < 0", async () => {
    const cartAddresses = [
      ["a", "30402:seller-pubkey:listing-1"],
      ["a", "30402:seller-pubkey:listing-2"],
    ];
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishSavedForLaterEvent(
      nostr as any,
      signer as any,
      "cart",
      userPubkey,
      cartAddresses,
      product,
      -1
    );

    const encryptedArg = signer.encrypt.mock.calls[0][1] as string;
    const tags: string[][] = JSON.parse(encryptedArg);
    const aTags = tags.filter((t) => t[0] === "a");
    expect(aTags).not.toContainEqual(["a", "30402:seller-pubkey:listing-1"]);
    expect(aTags).toContainEqual(["a", "30402:seller-pubkey:listing-2"]);
  });

  it("keeps cart addresses for other sellers when removing a product with the same d tag", async () => {
    const cartAddresses = [
      ["a", "30402:seller-pubkey:listing-1"],
      ["a", "30402:other-seller-pubkey:listing-1"],
      ["a", "30402:seller-pubkey:listing-2"],
    ];
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishSavedForLaterEvent(
      nostr as any,
      signer as any,
      "cart",
      userPubkey,
      cartAddresses,
      product,
      -1
    );

    const encryptedArg = signer.encrypt.mock.calls[0][1] as string;
    const tags: string[][] = JSON.parse(encryptedArg);
    const aTags = tags.filter((t) => t[0] === "a");
    expect(aTags).not.toContainEqual(["a", "30402:seller-pubkey:listing-1"]);
    expect(aTags).toContainEqual(["a", "30402:other-seller-pubkey:listing-1"]);
    expect(aTags).toContainEqual(["a", "30402:seller-pubkey:listing-2"]);
  });

  it("pushes quantity copies of the a tag when quantity > 0", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishSavedForLaterEvent(
      nostr as any,
      signer as any,
      "cart",
      userPubkey,
      [],
      product,
      3
    );

    const encryptedArg = signer.encrypt.mock.calls[0][1] as string;
    const tags: string[][] = JSON.parse(encryptedArg);
    const aTags = tags.filter((t) => t[0] === "a");
    expect(aTags).toHaveLength(3);
    aTags.forEach((t) => expect(t[1]).toBe("30402:seller-pubkey:listing-1"));
  });

  it("builds only d/title tags (no a tags) when quantity is absent", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishSavedForLaterEvent(
      nostr as any,
      signer as any,
      "saved",
      userPubkey,
      [],
      product
    );

    const encryptedArg = signer.encrypt.mock.calls[0][1] as string;
    const tags: string[][] = JSON.parse(encryptedArg);
    expect(tags.some((t) => t[0] === "a")).toBe(false);
    expect(tags.some((t) => t[0] === "d")).toBe(true);
    expect(tags.some((t) => t[0] === "title")).toBe(true);
  });

  it("builds only d/title tags (no a tags) when quantity is zero", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishSavedForLaterEvent(
      nostr as any,
      signer as any,
      "cart",
      userPubkey,
      [],
      product,
      0
    );

    const encryptedArg = signer.encrypt.mock.calls[0][1] as string;
    const tags: string[][] = JSON.parse(encryptedArg);
    expect(tags.some((t) => t[0] === "a")).toBe(false);
  });

  it("returns without throwing on success", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await expect(
      publishSavedForLaterEvent(
        nostr as any,
        signer as any,
        "cart",
        userPubkey,
        [],
        product,
        1
      )
    ).resolves.toBeUndefined();
  });

  it("returns silently when an inner error occurs", async () => {
    const signer = {
      encrypt: jest.fn().mockRejectedValue(new Error("Encrypt failed")),
      sign: jest.fn(),
    };
    const nostr = { publish: jest.fn() };

    await expect(
      publishSavedForLaterEvent(
        nostr as any,
        signer as any,
        "cart",
        userPubkey,
        [],
        product,
        1
      )
    ).resolves.toBeUndefined();
  });
});

describe("approveCommunityPost", () => {
  const community: Community = {
    id: "community-event-id",
    kind: 34550,
    pubkey: "moderator-pubkey",
    createdAt: 1,
    d: "my-community",
    name: "My Community",
    description: "A test community",
    image: "",
    moderators: ["moderator-pubkey"],
    relays: { approvals: [], requests: [], metadata: [], all: [] },
  };

  const postToApprove = {
    id: "post-event-id",
    kind: 1,
    pubkey: "author-pubkey",
    created_at: 1,
    content: "Hello community",
    tags: [],
    sig: "post-sig",
  };

  function makeSigner(signedId = "approval-event-id") {
    return {
      sign: jest.fn().mockImplementation(async (event: any) => ({
        ...event,
        id: signedId,
        pubkey: "moderator-pubkey",
        sig: "approval-sig",
      })),
    };
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates a kind-4550 event with a, e, p, k tags and the stringified post as content", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await approveCommunityPost(
      signer as any,
      nostr as any,
      postToApprove as any,
      community
    );

    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 4550,
        content: JSON.stringify(postToApprove),
        tags: expect.arrayContaining([
          ["a", "34550:moderator-pubkey:my-community"],
          ["e", "post-event-id"],
          ["p", "author-pubkey"],
          ["k", "1"],
        ]),
      })
    );
  });

  it("caches the signed event and returns it", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };
    // First call inside finalizeAndSendNostrEvent; second is the explicit cache call.
    (cacheEventToDatabase as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const result = await approveCommunityPost(
      signer as any,
      nostr as any,
      postToApprove as any,
      community
    );

    expect(cacheEventToDatabase).toHaveBeenCalledWith(
      expect.objectContaining({ id: "approval-event-id", kind: 4550 })
    );
    expect(result).toEqual(
      expect.objectContaining({ id: "approval-event-id", kind: 4550 })
    );
  });
});

describe("publishProofEvent", () => {
  const mint = "https://mint.example";
  const proofs = [{ id: "proof-1", amount: 100, secret: "s", C: "C" }] as any[];
  const emptyProofs: any[] = [];

  function makeSigner() {
    return {
      getPubKey: jest.fn().mockResolvedValue("user-pubkey"),
      encrypt: jest.fn().mockResolvedValue("encrypted-content"),
      sign: jest.fn().mockImplementation(async (event: any) => ({
        ...event,
        id: `signed-${event.kind}`,
        pubkey: "user-pubkey",
        sig: "sig",
      })),
    };
  }

  function encryptedProofPayload(signer: ReturnType<typeof makeSigner>) {
    return JSON.parse(
      (signer.encrypt as jest.Mock).mock.calls[0][1] as string
    ) as {
      mint: string;
      unit: string;
      proofs: unknown[];
      del?: string[];
    };
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (deleteEventsFromDatabase as jest.Mock).mockResolvedValue(undefined);
    (buildDeleteCachedEventsProof as jest.Mock).mockReturnValue({});
    (buildSignedHttpRequestProofTemplate as jest.Mock).mockReturnValue({
      kind: 27235,
      content: "",
      tags: [],
      created_at: 0,
    });
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates a kind-7375 proof event when proofs.length > 0", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishProofEvent(
      nostr as any,
      signer as any,
      mint,
      proofs,
      "in",
      "100"
    );

    const signedKinds = (signer.sign as jest.Mock).mock.calls.map(
      (call) => call[0].kind
    );
    expect(signedKinds).toContain(7375);
    expect(encryptedProofPayload(signer)).toEqual({
      mint,
      unit: "sat",
      proofs,
    });
  });

  it("skips kind-7375 creation when proofs is empty", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishProofEvent(
      nostr as any,
      signer as any,
      mint,
      emptyProofs,
      "out",
      "0"
    );

    const signedKinds = (signer.sign as jest.Mock).mock.calls.map(
      (call) => call[0].kind
    );
    expect(signedKinds).not.toContain(7375);
  });

  it("calls deleteEvent when deletedEventsArray is non-empty", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishProofEvent(
      nostr as any,
      signer as any,
      mint,
      proofs,
      "out",
      "100",
      ["old-proof-event-id"]
    );

    const signedKinds = (signer.sign as jest.Mock).mock.calls.map(
      (call) => call[0].kind
    );
    expect(signedKinds).toContain(5);
    expect(encryptedProofPayload(signer)).toEqual({
      mint,
      unit: "sat",
      proofs,
      del: ["old-proof-event-id"],
    });
  });

  it("skips deleteEvent when deletedEventsArray is absent", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishProofEvent(
      nostr as any,
      signer as any,
      mint,
      proofs,
      "in",
      "100"
    );

    const signedKinds = (signer.sign as jest.Mock).mock.calls.map(
      (call) => call[0].kind
    );
    expect(signedKinds).not.toContain(5);
  });

  it("skips deleteEvent when deletedEventsArray is empty", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishProofEvent(
      nostr as any,
      signer as any,
      mint,
      proofs,
      "in",
      "100",
      []
    );

    const signedKinds = (signer.sign as jest.Mock).mock.calls.map(
      (call) => call[0].kind
    );
    expect(signedKinds).not.toContain(5);
  });

  it("always calls publishSpendingHistoryEvent", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishProofEvent(
      nostr as any,
      signer as any,
      mint,
      emptyProofs,
      "in",
      "50"
    );

    const signedKinds = (signer.sign as jest.Mock).mock.calls.map(
      (call) => call[0].kind
    );
    expect(signedKinds).toContain(7376);
  });

  it("returns silently on any inner error", async () => {
    const signer = {
      getPubKey: jest.fn().mockRejectedValue(new Error("Signer unavailable")),
      encrypt: jest.fn(),
      sign: jest.fn(),
    };
    const nostr = { publish: jest.fn() };

    await expect(
      publishProofEvent(nostr as any, signer as any, mint, proofs, "in", "100")
    ).resolves.toBeUndefined();
  });
});

describe("publishSpendingHistoryEvent", () => {
  const relay = "wss://relay.example";

  function makeSigner() {
    return {
      getPubKey: jest.fn().mockResolvedValue("user-pubkey"),
      encrypt: jest
        .fn()
        .mockImplementation(
          async (_pubkey: string, content: string) => `encrypted:${content}`
        ),
      sign: jest.fn().mockImplementation(async (event: any) => ({
        ...event,
        id: `signed-${event.kind}`,
        pubkey: "user-pubkey",
        sig: "sig",
      })),
    };
  }

  function encryptedContent(signer: ReturnType<typeof makeSigner>): string[][] {
    return JSON.parse((signer.encrypt as jest.Mock).mock.calls[0][1] as string);
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify([relay]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("adds a destroyed tag for each sentEventId when sentEventIds is non-empty", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishSpendingHistoryEvent(
      nostr as any,
      signer as any,
      "out",
      "100",
      "kept-event-id",
      ["old-event-1", "old-event-2"]
    );

    const content = encryptedContent(signer);
    expect(content).toContainEqual(["e", "old-event-1", relay, "destroyed"]);
    expect(content).toContainEqual(["e", "old-event-2", relay, "destroyed"]);
  });

  it("omits destroyed tags when sentEventIds is absent", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishSpendingHistoryEvent(
      nostr as any,
      signer as any,
      "in",
      "50",
      "kept-event-id"
    );

    const content = encryptedContent(signer);
    expect(content.some((t) => t[3] === "destroyed")).toBe(false);
  });

  it("omits destroyed tags when sentEventIds is empty", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishSpendingHistoryEvent(
      nostr as any,
      signer as any,
      "in",
      "50",
      "kept-event-id",
      []
    );

    const content = encryptedContent(signer);
    expect(content.some((t) => t[3] === "destroyed")).toBe(false);
  });

  it("adds a created tag when keptEventId is non-empty", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishSpendingHistoryEvent(
      nostr as any,
      signer as any,
      "in",
      "100",
      "kept-event-id"
    );

    const content = encryptedContent(signer);
    expect(content).toContainEqual(["e", "kept-event-id", relay, "created"]);
  });

  it("omits the created tag when keptEventId is an empty string", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    await publishSpendingHistoryEvent(
      nostr as any,
      signer as any,
      "out",
      "100",
      ""
    );

    const content = encryptedContent(signer);
    expect(content.some((t) => t[3] === "created")).toBe(false);
  });

  it("returns silently on any inner error", async () => {
    const signer = {
      getPubKey: jest.fn().mockRejectedValue(new Error("Signer unavailable")),
      encrypt: jest.fn(),
      sign: jest.fn(),
    };
    const nostr = { publish: jest.fn() };

    await expect(
      publishSpendingHistoryEvent(nostr as any, signer as any, "in", "100", "")
    ).resolves.toBeUndefined();
  });
});

describe("createOrUpdateCommunity", () => {
  function makeSigner() {
    return {
      sign: jest.fn().mockImplementation(async (tpl: any) => ({
        ...tpl,
        id: "community-event-id",
        pubkey: "moderator-pubkey",
        sig: "sig",
      })),
    };
  }

  const baseDetails = {
    d: "my-community",
    name: "My Community",
    description: "A test community",
    image: "https://example.com/img.png",
    moderators: ["mod-pubkey-1", "mod-pubkey-2"],
  };

  function communityRelays(
    overrides: Partial<CommunityRelays>
  ): CommunityRelays {
    return {
      approvals: [],
      requests: [],
      metadata: [],
      all: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates a kind-34550 event with d, name, description, image, t, and p (moderator) tags", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await createOrUpdateCommunity(
      signer as any,
      nostr as any,
      baseDetails
    );

    expect(result.kind).toBe(34550);
    expect(result.tags).toEqual(
      expect.arrayContaining([
        ["d", "my-community"],
        ["name", "My Community"],
        ["description", "A test community"],
        ["image", "https://example.com/img.png"],
        ["t", "shopstr"],
        ["p", "mod-pubkey-1", "", "moderator"],
        ["p", "mod-pubkey-2", "", "moderator"],
      ])
    );
  });

  it('adds ["relay", url, "approvals"] tags when details.relays.approvals is provided', async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await createOrUpdateCommunity(signer as any, nostr as any, {
      ...baseDetails,
      relays: communityRelays({ approvals: ["wss://approvals.example"] }),
    });

    expect(result.tags).toContainEqual([
      "relay",
      "wss://approvals.example",
      "approvals",
    ]);
  });

  it('adds ["relay", url, "requests"] tags when details.relays.requests is provided', async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await createOrUpdateCommunity(signer as any, nostr as any, {
      ...baseDetails,
      relays: communityRelays({ requests: ["wss://requests.example"] }),
    });

    expect(result.tags).toContainEqual([
      "relay",
      "wss://requests.example",
      "requests",
    ]);
  });

  it('adds ["relay", url, "metadata"] tags when details.relays.metadata is provided', async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await createOrUpdateCommunity(signer as any, nostr as any, {
      ...baseDetails,
      relays: communityRelays({ metadata: ["wss://metadata.example"] }),
    });

    expect(result.tags).toContainEqual([
      "relay",
      "wss://metadata.example",
      "metadata",
    ]);
  });

  it('adds ["relay", url] tags (no type) when details.relays.all is provided', async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await createOrUpdateCommunity(signer as any, nostr as any, {
      ...baseDetails,
      relays: communityRelays({ all: ["wss://all.example"] }),
    });

    expect(result.tags).toContainEqual(["relay", "wss://all.example"]);
    expect(
      result.tags.find((t) => t[0] === "relay" && t[1] === "wss://all.example")
    ).toHaveLength(2);
  });

  it("skips all relay tags when details.relays is absent", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await createOrUpdateCommunity(
      signer as any,
      nostr as any,
      baseDetails
    );

    expect(result.tags.some((t) => t[0] === "relay")).toBe(false);
  });

  it("caches the signed event and returns it", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };
    // First call inside finalizeAndSendNostrEvent; second is the explicit cache call.
    (cacheEventToDatabase as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const result = await createOrUpdateCommunity(
      signer as any,
      nostr as any,
      baseDetails
    );

    expect(cacheEventToDatabase).toHaveBeenCalledWith(
      expect.objectContaining({ id: "community-event-id", kind: 34550 })
    );
    expect(result).toEqual(
      expect.objectContaining({ id: "community-event-id", kind: 34550 })
    );
  });
});

describe("retractApproval", () => {
  function makeSigner() {
    return {
      sign: jest.fn().mockImplementation(async (tpl: any) => ({
        ...tpl,
        id: "retract-event-id",
        pubkey: "moderator-pubkey",
        sig: "sig",
      })),
    };
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates a kind-5 event with the provided reason as content", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await retractApproval(
      signer as any,
      nostr as any,
      "approval-event-id",
      "Violated community rules"
    );

    expect(result.kind).toBe(5);
    expect(result.content).toBe("Violated community rules");
    expect(result.tags).toContainEqual(["e", "approval-event-id"]);
  });

  it("uses a default reason string when reason is absent", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await retractApproval(
      signer as any,
      nostr as any,
      "approval-event-id"
    );

    expect(result.kind).toBe(5);
    expect(result.content).toContain("approval-event-id");
    expect(result.tags).toContainEqual(["e", "approval-event-id"]);
  });
});

describe("createCommunityPost", () => {
  const community: Community = {
    id: "community-event-id",
    kind: 34550,
    pubkey: "community-pubkey",
    createdAt: 1,
    d: "my-community",
    name: "My Community",
    description: "A test community",
    image: "",
    moderators: ["community-pubkey"],
    relays: { approvals: [], requests: [], metadata: [], all: [] },
  };

  const communityAddress = "34550:community-pubkey:my-community";

  function makeSigner() {
    return {
      sign: jest.fn().mockImplementation(async (tpl: any) => ({
        ...tpl,
        id: "post-event-id",
        pubkey: "author-pubkey",
        sig: "sig",
      })),
    };
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("includes uppercase A/P/K tags and lowercase a/p/k pointing to the community for a top-level post", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await createCommunityPost(
      signer as any,
      nostr as any,
      community,
      "Hello community"
    );

    expect(result.kind).toBe(1111);
    expect(result.tags).toEqual(
      expect.arrayContaining([
        ["A", communityAddress],
        ["P", community.pubkey],
        ["K", "34550"],
        ["a", communityAddress],
        ["p", community.pubkey],
        ["k", "34550"],
      ])
    );
  });

  it("includes uppercase A/P/K plus e/p/k tags pointing to the parent for a reply", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };
    const parentEvent = {
      id: "parent-event-id",
      kind: 1111,
      pubkey: "parent-author-pubkey",
      created_at: 1,
      content: "Parent post",
      tags: [],
      sig: "parent-sig",
    };

    const result = await createCommunityPost(
      signer as any,
      nostr as any,
      community,
      "Replying here",
      { parentEvent: parentEvent as any }
    );

    expect(result.tags).toEqual(
      expect.arrayContaining([
        ["A", communityAddress],
        ["P", community.pubkey],
        ["K", "34550"],
        ["a", communityAddress],
        ["e", "parent-event-id", ""],
        ["p", "parent-author-pubkey", ""],
        ["k", "1111"],
      ])
    );
  });

  it("adds additional a tags for each cross-posted community when crosspostCommunities is present", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };
    const otherCommunity: Community = {
      ...community,
      kind: 34550,
      pubkey: "other-pubkey",
      d: "other-community",
    };

    const result = await createCommunityPost(
      signer as any,
      nostr as any,
      community,
      "Cross-posted",
      { crosspostCommunities: [otherCommunity] }
    );

    expect(result.tags).toEqual(
      expect.arrayContaining([["a", "34550:other-pubkey:other-community"]])
    );
  });

  it("adds an i tag when externalId is provided", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await createCommunityPost(
      signer as any,
      nostr as any,
      community,
      "External content",
      { externalId: "isbn:9781234567890" }
    );

    expect(result.tags).toContainEqual(["i", "isbn:9781234567890"]);
  });

  it("adds a k tag alongside i when contentKind is also provided", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await createCommunityPost(
      signer as any,
      nostr as any,
      community,
      "External content with kind",
      { externalId: "isbn:9781234567890", contentKind: "book" }
    );

    expect(result.tags).toContainEqual(["i", "isbn:9781234567890"]);
    expect(result.tags).toContainEqual(["k", "book"]);
  });

  it("omits the k tag alongside i when contentKind is absent", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await createCommunityPost(
      signer as any,
      nostr as any,
      community,
      "External content no kind",
      { externalId: "isbn:9781234567890" }
    );

    const kTags = result.tags.filter((t) => t[0] === "k");
    expect(kTags.some((t) => t[1] !== "34550" && t[1] !== "1111")).toBe(false);
  });

  it("caches the signed event and returns it", async () => {
    const signer = makeSigner();
    const nostr = { publish: jest.fn().mockResolvedValue(undefined) };
    (cacheEventToDatabase as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const result = await createCommunityPost(
      signer as any,
      nostr as any,
      community,
      "Hello community"
    );

    expect(cacheEventToDatabase).toHaveBeenCalledWith(
      expect.objectContaining({ id: "post-event-id", kind: 1111 })
    );
    expect(result).toEqual(
      expect.objectContaining({ id: "post-event-id", kind: 1111 })
    );
  });
});

describe("blossomUploadImages", () => {
  // jsdom does not implement File.arrayBuffer(); polyfill it so the source
  // code can call image.arrayBuffer() during tests.
  function makeImageFile(
    content = "fake-image-data",
    name = "test.png",
    type = "image/png"
  ) {
    const file = new File([content], name, { type });
    const bytes = new TextEncoder().encode(content);
    (file as any).arrayBuffer = async () => bytes.buffer.slice(0);
    return file;
  }

  function makeSigner() {
    return {
      sign: jest.fn().mockImplementation(async (event: any) => ({
        ...event,
        id: "signed-upload-event",
        pubkey: "user-pubkey",
        sig: "sig",
      })),
    };
  }

  function makeSuccessResponse(overrides: Record<string, unknown> = {}) {
    return {
      ok: true,
      json: async () => ({
        url: "https://blossom.example/abc123",
        sha256: "abc123sha256",
        size: 512,
        type: "image/png",
        ...overrides,
      }),
    };
  }

  beforeEach(() => {
    global.fetch = jest.fn();
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("throws when image.type does not include 'image'", async () => {
    const file = makeImageFile("content", "doc.pdf", "application/pdf");
    const signer = makeSigner();

    await expect(
      blossomUploadImages(file, signer as any, ["https://blossom.example"])
    ).rejects.toThrow("Only images are supported");
  });

  it("skips servers with empty/blank strings and uses only the valid ones", async () => {
    const signer = makeSigner();
    (global.fetch as jest.Mock).mockResolvedValue(makeSuccessResponse());

    const result = await blossomUploadImages(makeImageFile(), signer as any, [
      "",
      "  ",
      "https://blossom.example",
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });

  it("prepends https:// to a server URL that lacks a protocol prefix", async () => {
    const signer = makeSigner();
    (global.fetch as jest.Mock).mockResolvedValue(makeSuccessResponse());

    await blossomUploadImages(makeImageFile(), signer as any, [
      "blossom.example",
    ]);

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(calledUrl.toString()).toContain("https://blossom.example");
  });

  it("returns null and filters a server when the URL constructor throws (invalid format)", async () => {
    const signer = makeSigner();
    (global.fetch as jest.Mock).mockResolvedValue(makeSuccessResponse());

    const result = await blossomUploadImages(makeImageFile(), signer as any, [
      "[invalid",
      "https://blossom.example",
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });

  it("throws when no valid servers remain after filtering", async () => {
    const signer = makeSigner();

    await expect(
      blossomUploadImages(makeImageFile(), signer as any, ["", "[invalid"])
    ).rejects.toThrow("No valid Blossom servers configured");
  });

  it("throws when res.ok is false from the first server and includes the status code in the message", async () => {
    const signer = makeSigner();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 413,
      text: async () => "Payload Too Large",
    });

    await expect(
      blossomUploadImages(makeImageFile(), signer as any, [
        "https://blossom.example",
      ])
    ).rejects.toThrow("413");
  });

  it("returns the [url, x, ox, size, m] tags array from a standard response", async () => {
    const signer = makeSigner();
    (global.fetch as jest.Mock).mockResolvedValue(makeSuccessResponse());

    const result = await blossomUploadImages(makeImageFile(), signer as any, [
      "https://blossom.example",
    ]);

    expect(result).toEqual(
      expect.arrayContaining([
        ["url", "https://blossom.example/abc123"],
        ["x", "abc123sha256"],
        ["ox", "abc123sha256"],
        ["size", "512"],
        ["m", "image/png"],
      ])
    );
  });

  it("normalises NIP-94 format: reads url, sha256/ox, size, m from nip94_event.tags when top-level fields are absent", async () => {
    const signer = makeSigner();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        nip94_event: {
          tags: [
            ["url", "https://blossom.example/nip94url"],
            ["ox", "nip94sha256"],
            ["size", "256"],
            ["m", "image/jpeg"],
          ],
        },
      }),
    });

    const result = await blossomUploadImages(makeImageFile(), signer as any, [
      "https://blossom.example",
    ]);

    expect(result).toEqual(
      expect.arrayContaining([
        ["url", "https://blossom.example/nip94url"],
        ["x", "nip94sha256"],
        ["ox", "nip94sha256"],
        ["size", "256"],
        ["m", "image/jpeg"],
      ])
    );
  });

  it("constructs a fallback URL from /<sha256> when the response has no url", async () => {
    const signer = makeSigner();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sha256: "fallbackhash" }),
    });

    const result = await blossomUploadImages(makeImageFile(), signer as any, [
      "https://blossom.example",
    ]);

    expect(result[0]).toEqual(["url", "https://blossom.example/fallbackhash"]);
  });

  it("throws (and logs console.error) when no url can be recovered at all", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const signer = makeSigner();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await expect(
      blossomUploadImages(makeImageFile(), signer as any, [
        "https://blossom.example",
      ])
    ).rejects.toThrow("didn't provide a media URL");

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("adds x/ox tags only when sha256 is present in the response", async () => {
    const signer = makeSigner();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        url: "https://blossom.example/file",
        type: "image/png",
      }),
    });

    const result = await blossomUploadImages(makeImageFile(), signer as any, [
      "https://blossom.example",
    ]);

    expect(result.some((t) => t[0] === "x")).toBe(false);
    expect(result.some((t) => t[0] === "ox")).toBe(false);
  });

  it("adds size tag only when responseSize is defined and non-empty", async () => {
    const signer = makeSigner();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://blossom.example/file" }),
    });

    const result = await blossomUploadImages(makeImageFile(), signer as any, [
      "https://blossom.example",
    ]);

    expect(result.some((t) => t[0] === "size")).toBe(false);
  });

  it("adds m tag only when responseType is present", async () => {
    const signer = makeSigner();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://blossom.example/file" }),
    });

    const result = await blossomUploadImages(makeImageFile(), signer as any, [
      "https://blossom.example",
    ]);

    expect(result.some((t) => t[0] === "m")).toBe(false);
  });

  it("calls the /mirror endpoint (PUT) for every server beyond the first", async () => {
    const signer = makeSigner();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(makeSuccessResponse())
      .mockResolvedValueOnce({ ok: true });

    await blossomUploadImages(makeImageFile(), signer as any, [
      "https://primary.example",
      "https://mirror.example",
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const mirrorCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(mirrorCall[0].toString()).toBe("https://mirror.example/mirror");
    expect(mirrorCall[1].method).toBe("PUT");
  });

  it("caches the authorization event after a successful upload", async () => {
    const signer = makeSigner();
    (global.fetch as jest.Mock).mockResolvedValue(makeSuccessResponse());

    await blossomUploadImages(makeImageFile(), signer as any, [
      "https://blossom.example",
    ]);

    expect(cacheEventToDatabase).toHaveBeenCalledWith(
      expect.objectContaining({ id: "signed-upload-event" })
    );
  });
});

describe("followUser", () => {
  const userPubkey =
    "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const targetPubkey =
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      "relays",
      JSON.stringify(["wss://alive.example", "wss://dead.example"])
    );
    localStorage.setItem("readRelays", JSON.stringify([]));
    localStorage.setItem("writeRelays", JSON.stringify([]));
    (cacheEventToDatabase as jest.Mock).mockResolvedValue(undefined);
    (newPromiseWithTimeout as jest.Mock).mockImplementation(async (fn: any) => {
      return new Promise((resolve, reject) =>
        fn(resolve, reject, new AbortController().signal)
      );
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ contactList: null }),
    }) as typeof global.fetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates a first contact list when at least one source confirms it is empty", async () => {
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      sign: jest.fn().mockImplementation(async (template: any) => ({
        ...template,
        id: "signed-contact-list",
        pubkey: userPubkey,
        sig: "sig",
      })),
    };
    const nostr = {
      fetch: jest.fn((_filters: unknown, _opts: unknown, relays: string[]) =>
        relays[0] === "wss://dead.example"
          ? Promise.reject(new Error("relay down"))
          : Promise.resolve([])
      ),
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const result = await followUser(nostr as any, signer as any, targetPubkey);

    expect(result).toMatchObject({
      ok: true,
      event: {
        id: "signed-contact-list",
        kind: 3,
        tags: [["p", targetPubkey]],
      },
      alreadyApplied: false,
    });
    expect(getLatestLocalContactListEvent(userPubkey)).toMatchObject({
      id: "signed-contact-list",
      tags: [["p", targetPubkey]],
    });
  });
});
