jest.mock("nostr-tools", () => {
  const actual = jest.requireActual("nostr-tools");

  return {
    ...actual,
    finalizeEvent: jest.fn((event: Record<string, unknown>) => ({
      ...event,
      id: "b".repeat(64),
      sig: "c".repeat(128),
    })),
    getEventHash: jest.fn(() => "a".repeat(64)),
    nip44: {
      ...actual.nip44,
      getConversationKey: jest.fn(() => new Uint8Array(32)),
      encrypt: jest.fn((content: string) => `encrypted:${content}`),
    },
  };
});

import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import {
  constructGiftWrappedEvent,
  constructMessageGiftWrap,
  constructMessageSeal,
  createNostrDeleteEvent,
  finalizeAndSendNostrEvent,
  generateKeys,
  getDefaultBlossomServer,
  getDefaultMint,
  getDefaultRelays,
  getLocalStorageData,
  LogOut,
  parseBunkerToken,
  setLocalStorageDataOnSignIn,
  validateNPubKey,
  validateNSecKey,
  verifyNip05Identifier,
  withBlastr,
  decryptNpub,
  nostrExtensionLoaded,
  saveNWCString,
} from "../nostr-helper-functions";

describe("nostr-helper-functions", () => {
  const validPubkey =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    jest.useRealTimers();
    localStorage.clear();
    delete (window as any).nostr;
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ names: {} }),
    });
  });

  describe("parseBunkerToken", () => {
    it("parses a valid bunker token with relays and a secret", () => {
      const token =
        "bunker://remote-pubkey?secret=s3cr3t&relay=wss%3A%2F%2Fone.example&relay=wss%3A%2F%2Ftwo.example";

      expect(parseBunkerToken(token)).toEqual({
        remotePubkey: "remote-pubkey",
        relays: ["wss://one.example", "wss://two.example"],
        secret: "s3cr3t",
      });
    });

    it("returns null for non-bunker input and malformed URLs", () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation();

      expect(parseBunkerToken("nsec1not-a-bunker-token")).toBeNull();
      expect(parseBunkerToken("bunker://[invalid-host")).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to parse bunker token:",
        expect.objectContaining({ name: "TypeError" })
      );

      errorSpy.mockRestore();
    });
  });

  describe("delete event templates", () => {
    it("creates a delete event with event ids and optional deleted kind", () => {
      jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

      expect(createNostrDeleteEvent(["event-a", "event-b"], "delete", 30402))
        .toEqual({
          kind: 5,
          content: "delete",
          created_at: 1_700_000_000,
          tags: [
            ["e", "event-a"],
            ["e", "event-b"],
            ["k", "30402"],
          ],
        });
    });

    it("omits the kind tag when deleted kind is not supplied", () => {
      const event = createNostrDeleteEvent([], "delete");

      expect(event.tags).toEqual([]);
      expect(event.kind).toBe(5);
    });
  });

  describe("key and relay helpers", () => {
    it("generates matching bech32 nsec and npub keys", async () => {
      const keys = await generateKeys();

      expect(validateNSecKey(keys.nsec)).toBe(true);
      expect(validateNPubKey(keys.npub)).toBe(true);
      expect(nip19.decode(keys.nsec).type).toBe("nsec");
      expect(nip19.decode(keys.npub).type).toBe("npub");
    });

    it("validates npub and nsec strings by expected bech32 shape", () => {
      expect(validateNPubKey(`npub${"a".repeat(59)}`)).toBe(true);
      expect(validateNSecKey(`nsec${"z".repeat(59)}`)).toBe(true);
      expect(validateNPubKey("")).toBe(false);
      expect(validateNPubKey(`npub${"a".repeat(58)}`)).toBe(false);
      expect(validateNSecKey("nsec-short")).toBe(false);
    });

    it("adds the blastr relay only when a matching relay is absent", () => {
      expect(withBlastr(["wss://relay.example"])).toEqual([
        "wss://relay.example",
        "wss://sendit.nosflare.com",
      ]);
      expect(withBlastr(["wss://sendit.nosflare.com/"])).toEqual([
        "wss://sendit.nosflare.com/",
      ]);
    });

    it("exposes stable defaults used when storage is empty", () => {
      expect(getDefaultRelays()).toContain("wss://relay.damus.io");
      expect(getDefaultMint()).toBe("https://mint.minibits.cash/Bitcoin");
      expect(getDefaultBlossomServer()).toBe("https://cdn.nostrcheck.me");
    });

    it("detects the nostr browser extension", () => {
      expect(nostrExtensionLoaded()).toBe(false);
      (window as any).nostr = {};
      expect(nostrExtensionLoaded()).toBe(true);
    });

    it("decodes a valid npub back to its hex pubkey", () => {
      const npub = nip19.npubEncode(validPubkey);

      expect(decryptNpub(npub)).toBe(validPubkey);
    });
  });

  describe("local storage helpers", () => {
    it("writes explicit sign-in values and dispatches a storage event", () => {
      const storageListener = jest.fn();
      window.addEventListener("storage", storageListener);

      setLocalStorageDataOnSignIn({
        encryptedPrivateKey: "encrypted",
        relays: ["wss://relay.example"],
        readRelays: ["wss://read.example"],
        writeRelays: ["wss://write.example"],
        mints: ["https://mint.example"],
        blossomServers: ["https://cdn.example"],
        wot: 5,
        clientPubkey: "client-pubkey",
        clientPrivkey: "client-privkey",
        bunkerRemotePubkey: "remote-pubkey",
        bunkerRelays: ["wss://bunker.example"],
        bunkerSecret: "secret",
        signer: { type: "nip07" } as any,
        migrationComplete: true,
      });

      expect(getLocalStorageData()).toMatchObject({
        encryptedPrivateKey: "encrypted",
        relays: ["wss://relay.example"],
        readRelays: ["wss://read.example"],
        writeRelays: ["wss://write.example"],
        mints: ["https://mint.example"],
        blossomServers: ["https://cdn.example"],
        wot: 5,
        clientPrivkey: "client-privkey",
        bunkerRemotePubkey: "remote-pubkey",
        bunkerRelays: ["wss://bunker.example"],
        bunkerSecret: "secret",
        signer: { type: "nip07" },
        migrationComplete: true,
      });
      expect(storageListener).toHaveBeenCalled();

      window.removeEventListener("storage", storageListener);
    });

    it("falls back to defaults and removes malformed persisted JSON", () => {
      localStorage.setItem("relays", "not-json");
      localStorage.setItem("readRelays", JSON.stringify(["", "wss://read"]));
      localStorage.setItem("writeRelays", JSON.stringify([123]));
      localStorage.setItem("mints", JSON.stringify([]));
      localStorage.setItem("blossomServers", JSON.stringify([]));
      localStorage.setItem("tokens", JSON.stringify({ not: "array" }));
      localStorage.setItem("history", JSON.stringify("not-array"));
      localStorage.setItem("signer", JSON.stringify({ type: "nip46" }));

      const data = getLocalStorageData();

      expect(data.relays).toEqual(getDefaultRelays());
      expect(data.readRelays).toEqual(["wss://read"]);
      expect(data.writeRelays).toEqual([]);
      expect(data.mints).toEqual([getDefaultMint()]);
      expect(data.blossomServers).toEqual([getDefaultBlossomServer()]);
      expect(data.tokens).toEqual([]);
      expect(data.history).toEqual([]);
      expect(data.signer).toBeUndefined();
      expect(localStorage.getItem("signer")).toBe(JSON.stringify({ type: "nip46" }));
    });

    it("migrates legacy sign-in methods into signer metadata", () => {
      localStorage.setItem("signInMethod", "bunker");
      localStorage.setItem("clientPrivkey", "client-privkey");
      localStorage.setItem("bunkerRemotePubkey", "remote-pubkey");
      localStorage.setItem(
        "bunkerRelays",
        JSON.stringify(["wss://one.example", "wss://two.example"])
      );
      localStorage.setItem("bunkerSecret", "secret");

      expect(getLocalStorageData().signer).toEqual({
        type: "nip46",
        bunker:
          "bunker://remote-pubkey?secret=secret&relay=wss://one.example&relay=wss://two.example",
        appPrivKey: "client-privkey",
      });
      expect(localStorage.getItem("npub")).toBeNull();
      expect(localStorage.getItem("signIn")).toBeNull();
    });

    it("clears app-specific auth data on logout", () => {
      const storageListener = jest.fn();
      window.addEventListener("storage", storageListener);
      localStorage.setItem("npub", "legacy");
      localStorage.setItem("encryptedPrivateKey", "encrypted");
      localStorage.setItem("relays", JSON.stringify(["wss://relay"]));

      LogOut();

      expect(localStorage.getItem("npub")).toBeNull();
      expect(localStorage.getItem("encryptedPrivateKey")).toBeNull();
      expect(localStorage.getItem("relays")).toBeNull();
      expect(storageListener).toHaveBeenCalled();

      window.removeEventListener("storage", storageListener);
    });

    it("stores and clears NWC strings with associated metadata", () => {
      saveNWCString("nostr+walletconnect://value");
      expect(localStorage.getItem("nwcString")).toBe(
        "nostr+walletconnect://value"
      );

      localStorage.setItem("nwcInfo", "cached-info");
      saveNWCString("");
      expect(localStorage.getItem("nwcString")).toBeNull();
      expect(localStorage.getItem("nwcInfo")).toBeNull();
    });
  });

  describe("verifyNip05Identifier", () => {
    it("returns true when the well-known response maps the name to pubkey", async () => {
      (globalThis.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ names: { alice: validPubkey } }),
      });

      await expect(
        verifyNip05Identifier("alice@example.com", validPubkey)
      ).resolves.toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://example.com/.well-known/nostr.json?name=alice",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it("handles empty input, malformed identifiers, non-ok responses, invalid JSON, and rejected fetches", async () => {
      await expect(verifyNip05Identifier("", validPubkey)).resolves.toBe(false);
      await expect(
        verifyNip05Identifier("not-an-identifier", validPubkey)
      ).resolves.toBe(false);

      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
      await expect(
        verifyNip05Identifier("alice@example.com", validPubkey)
      ).resolves.toBe(false);

      (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error("invalid json");
        },
      });
      await expect(
        verifyNip05Identifier("alice@example.com", validPubkey)
      ).resolves.toBe(false);

      (globalThis.fetch as jest.Mock).mockRejectedValueOnce(
        new Error("network down")
      );
      await expect(
        verifyNip05Identifier("alice@example.com", validPubkey)
      ).resolves.toBe(false);
    });
  });

  describe("Nostr event construction", () => {
    beforeEach(() => {
      localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
      localStorage.setItem(
        "writeRelays",
        JSON.stringify(["wss://write.example"])
      );
    });

    it("constructs regular gift-wrapped message events with product references", async () => {
      const eventWithProduct = await constructGiftWrappedEvent(
        validPubkey,
        "recipient-pubkey",
        "hello",
        "Question",
        {
          productData: {
            id: "product-id",
            pubkey: "seller-pubkey",
            d: "product-d",
          } as any,
        }
      );
      const eventWithAddress = await constructGiftWrappedEvent(
        validPubkey,
        "recipient-pubkey",
        "hello",
        "Question",
        {
          productAddress: "30402:seller-pubkey:product-d",
        }
      );

      expect(eventWithProduct).toMatchObject({
        pubkey: validPubkey,
        content: "hello",
        kind: 14,
        tags: [
          ["p", "recipient-pubkey", "wss://relay.example"],
          ["subject", "Question"],
          ["a", "30402:seller-pubkey:product-d", "wss://relay.example"],
        ],
      });
      expect(eventWithProduct.id).toHaveLength(64);
      expect(eventWithAddress.tags).toContainEqual([
        "a",
        "30402:seller-pubkey:product-d",
        "wss://relay.example",
      ]);
    });

    it("constructs order gift-wrapped events with optional payment, fulfillment, donation, and item tags", async () => {
      const event = await constructGiftWrappedEvent(
        validPubkey,
        "recipient-pubkey",
        "order details",
        "Order",
        {
          kind: 15,
          isOrder: true,
          orderId: "order-1",
          type: 1,
          paymentType: "cashu",
          paymentReference: "token",
          paymentProof: "proof",
          orderAmount: 2500,
          status: "paid",
          tracking: "TRACK123",
          carrier: "UPS",
          eta: 1_700_001_000,
          contact: "buyer@example.com",
          address: "123 Main St",
          pickup: "front desk",
          buyerPubkey: "buyer-pubkey",
          donationAmount: 100,
          donationPercentage: 4,
          selectedSize: "L",
          selectedVolume: "1L",
          selectedWeight: "2kg",
          selectedBulkOption: 10,
          productAddress: "30402:seller-pubkey:product-d",
          quantity: 3,
        }
      );

      expect(event.kind).toBe(15);
      expect(event.tags).toEqual(
        expect.arrayContaining([
          ["order", "order-1"],
          ["b", "buyer-pubkey"],
          ["type", "1"],
          ["amount", "2500"],
          ["payment", "cashu", "token", "proof"],
          ["status", "paid"],
          ["tracking", "TRACK123"],
          ["carrier", "UPS"],
          ["eta", "1700001000"],
          ["contact", "buyer@example.com"],
          ["address", "123 Main St"],
          ["pickup", "front desk"],
          ["size", "L"],
          ["volume", "1L"],
          ["weight", "2kg"],
          ["bulk", "10"],
          ["donation_amount", "100", "4"],
          ["item", "30402:seller-pubkey:product-d", "3"],
        ])
      );
    });

    it("seals messages with either a signer or an ephemeral private key", async () => {
      const randomPrivkey = generateSecretKey();
      const recipientPrivkey = generateSecretKey();
      const recipientPubkey = getPublicKey(recipientPrivkey);
      const messageEvent = await constructGiftWrappedEvent(
        validPubkey,
        recipientPubkey,
        "hello",
        "Subject"
      );
      const signer = {
        encrypt: jest.fn().mockResolvedValue("encrypted-by-signer"),
        sign: jest.fn(async (event) => ({
          ...event,
          id: "signed-id",
          sig: "signed-sig",
        })),
      };

      const signerSeal = await constructMessageSeal(
        signer as any,
        messageEvent,
        validPubkey,
        recipientPubkey
      );
      const ephemeralSeal = await constructMessageSeal(
        signer as any,
        messageEvent,
        getPublicKey(randomPrivkey),
        recipientPubkey,
        randomPrivkey
      );

      expect(signer.encrypt).toHaveBeenCalledWith(
        recipientPubkey,
        JSON.stringify(messageEvent)
      );
      expect(signerSeal).toMatchObject({
        id: "signed-id",
        sig: "signed-sig",
        content: "encrypted-by-signer",
        kind: 13,
      });
      expect(ephemeralSeal.kind).toBe(13);
      expect(ephemeralSeal.id).toHaveLength(64);
      expect(ephemeralSeal.sig).toHaveLength(128);
      expect(ephemeralSeal.content).not.toBe(JSON.stringify(messageEvent));
    });

    it("wraps sealed messages for the recipient with an ephemeral key", async () => {
      const randomPrivkey = generateSecretKey();
      const recipientPubkey = getPublicKey(generateSecretKey());
      const randomPubkey = getPublicKey(randomPrivkey);
      const sealEvent = {
        id: "seal-id",
        sig: "seal-sig",
        pubkey: validPubkey,
        created_at: 1,
        kind: 13,
        content: "sealed",
        tags: [],
      };

      const giftWrap = await constructMessageGiftWrap(
        sealEvent,
        randomPubkey,
        randomPrivkey,
        recipientPubkey
      );

      expect(giftWrap.kind).toBe(1059);
      expect(giftWrap.pubkey).toBe(randomPubkey);
      expect(giftWrap.tags).toEqual([
        ["p", recipientPubkey, "wss://relay.example"],
      ]);
      expect(giftWrap.id).toHaveLength(64);
      expect(giftWrap.sig).toHaveLength(128);
    });

    it("signs and publishes events to write relays plus blastr", async () => {
      const signedEvent = {
        id: "event-id",
        sig: "event-sig",
        pubkey: validPubkey,
        created_at: 1,
        kind: 1,
        content: "content",
        tags: [],
      };
      const signer = {
        sign: jest.fn().mockResolvedValue(signedEvent),
      };
      const nostr = {
        publish: jest.fn().mockResolvedValue(undefined),
      };

      await expect(
        finalizeAndSendNostrEvent(signer as any, nostr as any, {
          kind: 1,
          content: "content",
          tags: [],
          created_at: 1,
        })
      ).resolves.toBe(signedEvent);

      expect(signer.sign).toHaveBeenCalledWith({
        kind: 1,
        content: "content",
        tags: [],
        created_at: 1,
      });
      expect(nostr.publish).toHaveBeenCalledWith(signedEvent, [
        "wss://write.example",
        "wss://relay.example",
        "wss://sendit.nosflare.com",
      ]);
    });

    it("rejects when signing fails", async () => {
      const signer = {
        sign: jest.fn().mockRejectedValue(new Error("sign failed")),
      };

      await expect(
        finalizeAndSendNostrEvent(signer as any, { publish: jest.fn() } as any, {
          kind: 1,
          content: "",
          tags: [],
          created_at: 1,
        })
      ).rejects.toThrow("sign failed");
    });
  });
});
