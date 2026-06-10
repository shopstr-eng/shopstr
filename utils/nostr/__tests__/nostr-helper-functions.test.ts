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
  constructGiftWrappedEvent,
  constructMessageGiftWrap,
  constructMessageSeal,
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
  REPORT_TYPES,
  saveNWCString,
  setLocalStorageDataOnSignIn,
  validateNPubKey,
  validateNSecKey,
  verifyNip05Identifier,
  withBlastr,
} from "../nostr-helper-functions";
import { finalizeEvent, nip19, nip44 } from "nostr-tools";
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
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
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
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/db/cache-event",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("signed-profile-report"),
      })
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
