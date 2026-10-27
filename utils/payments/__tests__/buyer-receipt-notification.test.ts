/**
 * @jest-environment jsdom
 */
import { nip19 } from "nostr-tools";
import { sendBuyerOrderReceipt } from "../buyer-receipt-notification";
import {
  constructGiftWrappedEvent,
  constructMessageGiftWrap,
  constructMessageSeal,
  sendGiftWrappedMessageEvent,
} from "@/utils/nostr/gift-wrap";
import {
  buildDelayedOrderReceiptMessage,
  buildOrderProcessedReceiptMessage,
  buildThankYouReceiptMessage,
} from "../checkout-messages";

jest.mock("@/utils/nostr/gift-wrap", () => ({
  constructGiftWrappedEvent: jest.fn(),
  constructMessageSeal: jest.fn(),
  constructMessageGiftWrap: jest.fn(),
  sendGiftWrappedMessageEvent: jest.fn(),
}));

const mockConstructGiftWrappedEvent =
  constructGiftWrappedEvent as jest.MockedFunction<
    typeof constructGiftWrappedEvent
  >;
const mockConstructMessageSeal = constructMessageSeal as jest.MockedFunction<
  typeof constructMessageSeal
>;
const mockConstructMessageGiftWrap =
  constructMessageGiftWrap as jest.MockedFunction<
    typeof constructMessageGiftWrap
  >;
const mockSendGiftWrappedMessageEvent =
  sendGiftWrappedMessageEvent as jest.MockedFunction<
    typeof sendGiftWrappedMessageEvent
  >;

const nostr = {} as any;
const signer = {} as any;

const SELLER_PUBKEY = "b".repeat(64);
const BUYER_PUBKEY = "c".repeat(64);

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "order-1",
    mintUrl: "https://mint.example",
    sellerPubkey: SELLER_PUBKEY,
    buyerPubkey: BUYER_PUBKEY,
    lnurl: "seller@example.com",
    sellerAmount: 1000,
    status: "pending" as const,
    meltQuoteId: "melt-quote-1",
    recoverableProofs: [],
    quarantinedProofs: [],
    errorMessage: "mint still processing",
    createdAt: 1,
    updatedAt: 1,
    productTitle: "Handmade Mug",
    productDetails: " in size M (pickup at: Downtown Store)",
    quantity: 2,
    productAddress: `30402:${SELLER_PUBKEY}:handmade-mug`,
    address: "Ada Lovelace, 123 Main St, Metropolis, NY, 12345, USA",
    pickup: "Downtown Store",
    donationAmount: 21,
    donationPercentage: 2.1,
    ...overrides,
  };
}

const innerEvent = {
  id: "inner",
  pubkey: "sender",
  created_at: 1,
  content: "",
  kind: 14,
  tags: [],
} as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockConstructGiftWrappedEvent.mockResolvedValue(innerEvent);
  mockConstructMessageSeal.mockResolvedValue({ kind: 13 } as any);
  mockConstructMessageGiftWrap.mockResolvedValue({ kind: 1059 } as any);
  mockSendGiftWrappedMessageEvent.mockResolvedValue(undefined);
});

describe("sendBuyerOrderReceipt", () => {
  it("sends the same order-receipt DM the checkout path sends for shipping orders", async () => {
    const record = makeRecord();

    const result = await sendBuyerOrderReceipt({
      nostr,
      signer,
      record,
      buyerPubkey: BUYER_PUBKEY,
    });

    expect(mockConstructGiftWrappedEvent).toHaveBeenCalledTimes(1);
    const [sender, recipient, message, subject, options] =
      mockConstructGiftWrappedEvent.mock.calls[0]!;
    expect(typeof sender).toBe("string");
    // The receipt goes to the BUYER, unlike the seller payment DM.
    expect(recipient).toBe(BUYER_PUBKEY);
    expect(subject).toBe("order-receipt");
    expect(message).toBe(
      buildOrderProcessedReceiptMessage(
        "Handmade Mug",
        " in size M (pickup at: Downtown Store)",
        nip19.npubEncode(SELLER_PUBKEY)
      )
    );
    expect(options).toMatchObject({
      isOrder: true,
      type: 4,
      status: "confirmed",
      orderId: "order-1",
      orderAmount: 1000,
      productAddress: `30402:${SELLER_PUBKEY}:handmade-mug`,
      quantity: 2,
      paymentType: "lightning",
      paymentReference: "seller@example.com",
      address: "Ada Lovelace, 123 Main St, Metropolis, NY, 12345, USA",
      pickup: "Downtown Store",
      buyerPubkey: BUYER_PUBKEY,
      donationAmount: 21,
      donationPercentage: 2.1,
    });
    expect(mockSendGiftWrappedMessageEvent).toHaveBeenCalledWith(
      nostr,
      expect.anything(),
      signer,
      { requireDurableCache: true, requireRelayDelivery: true }
    );
    // The inner rumor is returned so the caller can add it to chat history.
    expect(result).toBe(innerEvent);
  });

  it("uses the order-processed receipt for a shipping order even without a pickup location", async () => {
    // Single-product checkout only records `pickup` when a pickup location
    // was selected; a plain shipping order carries `address` alone.
    const record = makeRecord({ pickup: undefined });

    await sendBuyerOrderReceipt({
      nostr,
      signer,
      record,
      buyerPubkey: BUYER_PUBKEY,
    });

    const [, , message] = mockConstructGiftWrappedEvent.mock.calls[0]!;
    expect(message).toBe(
      buildOrderProcessedReceiptMessage(
        "Handmade Mug",
        " in size M (pickup at: Downtown Store)",
        nip19.npubEncode(SELLER_PUBKEY)
      )
    );
  });

  it("uses the thank-you receipt when no fulfillment details exist", async () => {
    const record = makeRecord({ address: undefined, pickup: undefined });

    await sendBuyerOrderReceipt({
      nostr,
      signer,
      record,
      buyerPubkey: BUYER_PUBKEY,
    });

    const [, , message] = mockConstructGiftWrappedEvent.mock.calls[0]!;
    expect(message).toBe(
      buildThankYouReceiptMessage(
        "Handmade Mug",
        " in size M (pickup at: Downtown Store)",
        nip19.npubEncode(SELLER_PUBKEY)
      )
    );
  });

  it("falls back to a generic receipt for records without captured context", async () => {
    const record = makeRecord({
      productTitle: undefined,
      productDetails: undefined,
      quantity: undefined,
      productAddress: undefined,
      address: undefined,
      pickup: undefined,
      donationAmount: undefined,
      donationPercentage: undefined,
    });

    await sendBuyerOrderReceipt({
      nostr,
      signer,
      record,
      buyerPubkey: BUYER_PUBKEY,
    });

    const [, recipient, message, subject, options] =
      mockConstructGiftWrappedEvent.mock.calls[0]!;
    expect(recipient).toBe(BUYER_PUBKEY);
    expect(subject).toBe("order-receipt");
    expect(message).toBe(
      buildDelayedOrderReceiptMessage({
        orderId: "order-1",
        sellerNpub: nip19.npubEncode(SELLER_PUBKEY),
      })
    );
    expect(message).toContain("order order-1");
    expect(options).toMatchObject({
      type: 4,
      status: "confirmed",
      orderId: "order-1",
      quantity: 1,
      paymentType: "lightning",
      buyerPubkey: BUYER_PUBKEY,
    });
    expect(options!.productAddress).toBeUndefined();
  });

  it("retries with fresh keys and succeeds after a transient failure", async () => {
    mockSendGiftWrappedMessageEvent
      .mockRejectedValueOnce(new Error("relay offline"))
      .mockResolvedValueOnce(undefined);

    await sendBuyerOrderReceipt({
      nostr,
      signer,
      record: makeRecord(),
      buyerPubkey: BUYER_PUBKEY,
    });

    expect(mockSendGiftWrappedMessageEvent).toHaveBeenCalledTimes(2);
    const firstSender = mockConstructGiftWrappedEvent.mock.calls[0]![0];
    const secondSender = mockConstructGiftWrappedEvent.mock.calls[1]![0];
    expect(secondSender).not.toBe(firstSender);
  }, 15000);

  it("throws after all attempts so the caller can surface the failure", async () => {
    mockSendGiftWrappedMessageEvent.mockRejectedValue(
      new Error("no relays available")
    );

    await expect(
      sendBuyerOrderReceipt({
        nostr,
        signer,
        record: makeRecord(),
        buyerPubkey: BUYER_PUBKEY,
      })
    ).rejects.toThrow("no relays available");

    expect(mockSendGiftWrappedMessageEvent).toHaveBeenCalledTimes(3);
  }, 15000);
});
