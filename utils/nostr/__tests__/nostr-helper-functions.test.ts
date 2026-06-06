jest.mock("nostr-tools", () => ({
  ...jest.requireActual("nostr-tools"),
  getEventHash: jest.fn(() => "f".repeat(64)),
}));

import {
  constructGiftWrappedEvent,
  createNostrDeleteEvent,
  decryptNpub,
  getDefaultBlossomServer,
  getDefaultMint,
  getDefaultRelays,
  getLocalStorageData,
  getLocalUserProfileKey,
  isProfileContentPopulated,
  parseLocalProfileFallback,
  parseBunkerToken,
  publishReportEvent,
  setLocalStorageDataOnSignIn,
  validateNPubKey,
  validateNSecKey,
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
    const count = result.filter((r) =>
      r.includes("sendit.nosflare.com")
    ).length;
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
