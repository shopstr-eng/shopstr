jest.mock("nostr-tools", () => {
  const actual = jest.requireActual("nostr-tools");
  return {
    ...actual,
    getEventHash: jest.fn(() => "mocked-event-hash"),
  };
});

import { getPublicKey, nip19 } from "nostr-tools";
import type { ProductData } from "@/utils/parsers/product-parser-functions";
import {
  constructGiftWrappedEvent,
  createNostrDeleteEvent,
  generateKeys,
  parseBunkerToken,
  withBlastr,
} from "../nostr-helper-functions";

jest.mock("@/utils/db/db-client", () => ({
  cacheEventToDatabase: jest.fn(),
  deleteEventsFromDatabase: jest.fn(),
}));

jest.mock("@/utils/timeout", () => ({
  newPromiseWithTimeout: jest.fn(),
}));

const senderPubkey =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const recipientPubkey =
  "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
const sellerPubkey =
  "1111111111111111111111111111111111111111111111111111111111111111";
const buyerPubkey =
  "2222222222222222222222222222222222222222222222222222222222222222";

describe("nostr-helper-functions", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  describe("generateKeys", () => {
    it("returns a matching nsec/npub keypair", async () => {
      const { nsec, npub } = await generateKeys();

      expect(nsec.startsWith("nsec")).toBe(true);
      expect(npub.startsWith("npub")).toBe(true);

      const decoded = nip19.decode(nsec);
      expect(decoded.type).toBe("nsec");

      const derivedPubkey = getPublicKey(decoded.data as Uint8Array);
      expect(nip19.npubEncode(derivedPubkey)).toBe(npub);
    });
  });

  describe("createNostrDeleteEvent", () => {
    it("includes e-tags for each deleted event and an optional kind tag", () => {
      const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

      const event = createNostrDeleteEvent(["event-1", "event-2"], "cleanup", 30402);

      expect(event).toEqual({
        kind: 5,
        content: "cleanup",
        created_at: 1_700_000_000,
        tags: [
          ["e", "event-1"],
          ["e", "event-2"],
          ["k", "30402"],
        ],
      });

      nowSpy.mockRestore();
    });

    it("omits the kind tag when deletedKind is not provided", () => {
      const event = createNostrDeleteEvent(["event-1"], "cleanup");

      expect(event.tags).toEqual([["e", "event-1"]]);
    });
  });

  describe("parseBunkerToken", () => {
    it("parses remote pubkey, relay list, and secret from a bunker token", () => {
      const token =
        "bunker://abcdef1234567890?relay=wss://relay.one&relay=wss://relay.two&secret=shh";

      expect(parseBunkerToken(token)).toEqual({
        remotePubkey: "abcdef1234567890",
        relays: ["wss://relay.one", "wss://relay.two"],
        secret: "shh",
      });
    });

    it("returns null for invalid or malformed bunker tokens", () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      expect(parseBunkerToken("nostrconnect://abc")).toBeNull();
      expect(parseBunkerToken("bunker://")).toBeNull();

      errorSpy.mockRestore();
    });
  });

  describe("withBlastr", () => {
    it("adds the sendit relay when missing", () => {
      expect(withBlastr(["wss://relay.one"])).toEqual([
        "wss://relay.one",
        "wss://sendit.nosflare.com",
      ]);
    });

    it("does not add a duplicate sendit relay", () => {
      expect(withBlastr(["wss://sendit.nosflare.com"])).toEqual([
        "wss://sendit.nosflare.com",
      ]);
    });
  });

  describe("constructGiftWrappedEvent", () => {
    beforeEach(() => {
      localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    });

    it("builds order tags for payment, fulfillment, donation, and product references", async () => {
      jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

      const event = await constructGiftWrappedEvent(
        senderPubkey,
        recipientPubkey,
        "Paid invoice",
        "order-payment",
        {
          isOrder: true,
          orderId: "order-123",
          type: 1,
          paymentType: "cashu",
          paymentReference: "token-abc",
          paymentProof: "proof-xyz",
          orderAmount: 21_000,
          status: "paid",
          tracking: "TRACK123",
          carrier: "DHL",
          eta: 1_700_000_500,
          contact: "buyer@example.com",
          address: "1 Main St",
          pickup: "front-desk",
          buyerPubkey,
          donationAmount: 500,
          donationPercentage: 5,
          selectedSize: "XL",
          selectedVolume: "1L",
          selectedWeight: "2kg",
          selectedBulkOption: 3,
          quantity: 2,
          productData: {
            pubkey: sellerPubkey,
            d: "listing-d",
          } as unknown as ProductData,
        }
      );

      expect(event.pubkey).toBe(senderPubkey);
      expect(event.kind).toBe(14);
      expect(event.created_at).toBe(1_700_000_000);
      expect(event.content).toBe("Paid invoice");
      expect(event.id).toBe("mocked-event-hash");
      expect(event.tags).toEqual(
        expect.arrayContaining([
          ["p", recipientPubkey, "wss://relay.example"],
          ["subject", "order-payment"],
          ["order", "order-123"],
          ["b", buyerPubkey],
          ["type", "1"],
          ["amount", "21000"],
          ["payment", "cashu", "token-abc", "proof-xyz"],
          ["status", "paid"],
          ["tracking", "TRACK123"],
          ["carrier", "DHL"],
          ["eta", "1700000500"],
          ["contact", "buyer@example.com"],
          ["address", "1 Main St"],
          ["pickup", "front-desk"],
          ["size", "XL"],
          ["volume", "1L"],
          ["weight", "2kg"],
          ["bulk", "3"],
          ["donation_amount", "500", "5"],
          ["item", `30402:${sellerPubkey}:listing-d`, "2"],
        ])
      );
      expect(event.tags.find((tag) => tag[0] === "a")).toBeUndefined();
    });

    it("builds a non-order message tag with a product address reference", async () => {
      jest.spyOn(Date, "now").mockReturnValue(1_700_000_100_000);

      const event = await constructGiftWrappedEvent(
        senderPubkey,
        recipientPubkey,
        "Question about listing",
        "listing-inquiry",
        {
          kind: 1111,
          productAddress: `30402:${sellerPubkey}:listing-d`,
        }
      );

      expect(event.kind).toBe(1111);
      expect(event.created_at).toBe(1_700_000_100);
      expect(event.tags).toEqual([
        ["p", recipientPubkey, "wss://relay.example"],
        ["subject", "listing-inquiry"],
        ["a", `30402:${sellerPubkey}:listing-d`, "wss://relay.example"],
      ]);
    });

    it("defaults order item quantity to 1 when quantity is not provided", async () => {
      const event = await constructGiftWrappedEvent(
        senderPubkey,
        recipientPubkey,
        "Receipt",
        "order-receipt",
        {
          isOrder: true,
          orderId: "order-456",
          productAddress: `30402:${sellerPubkey}:listing-d`,
        }
      );

      expect(event.tags).toEqual(
        expect.arrayContaining([
          ["order", "order-456"],
          ["item", `30402:${sellerPubkey}:listing-d`, "1"],
        ])
      );
    });
  });
});
