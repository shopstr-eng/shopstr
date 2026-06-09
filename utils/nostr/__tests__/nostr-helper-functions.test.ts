jest.mock("nostr-tools", () => ({
  ...jest.requireActual("nostr-tools"),
  getEventHash: jest.fn(() => "f".repeat(64)),
}));

import {
  constructGiftWrappedEvent,
  createNostrDeleteEvent,
  decryptNpub,
  generateKeys,
  getDefaultBlossomServer,
  getDefaultMint,
  getDefaultRelays,
  getLocalStorageData,
  getLocalUserProfileKey,
  isProfileContentPopulated,
  LogOut,
  nostrExtensionLoaded,
  parseLocalProfileFallback,
  parseBunkerToken,
  publishReportEvent,
  setLocalStorageDataOnSignIn,
  validateNPubKey,
  validateNSecKey,
  verifyNip05Identifier,
  withBlastr,
} from "../nostr-helper-functions";
import { nip19 } from "nostr-tools";
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

describe("validateNPubKey", () => {
  it("returns true for a valid npub string", () => {
    expect(validateNPubKey("npub" + "a".repeat(59))).toBe(true);
  });

  it("returns false for a string that is too short", () => {
    expect(validateNPubKey("npub123")).toBe(false);
  });

  it("returns false for a string with invalid characters", () => {
    expect(validateNPubKey("npub" + "!".repeat(59))).toBe(false);
  });
});

describe("validateNSecKey", () => {
  it("returns true for a valid nsec string", () => {
    expect(validateNSecKey("nsec" + "a".repeat(59))).toBe(true);
  });

  it("returns false for a short or malformed string", () => {
    expect(validateNSecKey("nsec123")).toBe(false);
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

describe("decryptNpub", () => {
  const hexPubkey =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("returns the hex pubkey for a valid bech32 npub string", () => {
    const npub = nip19.npubEncode(hexPubkey);
    expect(decryptNpub(npub)).toBe(hexPubkey);
  });

  it("returns null when the decoded type is not npub", () => {
    const noteBech32 = nip19.noteEncode(hexPubkey);
    expect(decryptNpub(noteBech32)).toBeNull();
  });

  it("returns null when nip19.decode throws", () => {
    expect(decryptNpub("not-a-valid-bech32-string")).toBeNull();
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

describe("generateKeys", () => {
  it("returns nsec and npub strings with the correct prefixes", async () => {
    const { nsec, npub } = await generateKeys();
    expect(nsec).toMatch(/^nsec/);
    expect(npub).toMatch(/^npub/);
  });

  it("returns different key pairs on successive calls", async () => {
    const first = await generateKeys();
    const second = await generateKeys();
    expect(first.nsec).not.toBe(second.nsec);
    expect(first.npub).not.toBe(second.npub);
  });
});

describe("parseBunkerToken", () => {
  it("returns null when the token does not start with bunker://", () => {
    expect(parseBunkerToken("https://example.com")).toBeNull();
  });

  it("parses remotePubkey, relays, and secret from a well-formed token", () => {
    const token =
      "bunker://remote-pubkey-hex" +
      "?relay=wss%3A%2F%2Frelay1.example" +
      "&relay=wss%3A%2F%2Frelay2.example" +
      "&secret=my-secret";
    expect(parseBunkerToken(token)).toEqual({
      remotePubkey: "remote-pubkey-hex",
      relays: ["wss://relay1.example", "wss://relay2.example"],
      secret: "my-secret",
    });
  });

  it("returns undefined secret when the secret query param is absent", () => {
    const token = "bunker://remote-pubkey-hex?relay=wss%3A%2F%2Frelay.example";
    const result = parseBunkerToken(token);
    expect(result?.secret).toBeUndefined();
    expect(result?.remotePubkey).toBe("remote-pubkey-hex");
  });

  it("returns null and calls console.error when the URL constructor throws", () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(parseBunkerToken("bunker://[invalid-host")).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
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

describe("nostrExtensionLoaded", () => {
  afterEach(() => {
    (window as any).nostr = undefined;
  });

  it("returns true when window.nostr is set to a truthy object", () => {
    (window as any).nostr = { getPublicKey: jest.fn() };
    expect(nostrExtensionLoaded()).toBe(true);
  });

  it("returns false when window.nostr is undefined", () => {
    (window as any).nostr = undefined;
    expect(nostrExtensionLoaded()).toBe(false);
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
