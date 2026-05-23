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
