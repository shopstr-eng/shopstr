/**
 * @jest-environment jsdom
 */
import { nip19 } from "nostr-tools";
import { notifySellerOfCompletedPayout } from "../seller-payout-notification";
import {
  constructGiftWrappedEvent,
  constructMessageGiftWrap,
  constructMessageSeal,
  sendGiftWrappedMessageEvent,
} from "@/utils/nostr/gift-wrap";
import { buildLightningPaymentMessage } from "../checkout-messages";

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

beforeEach(() => {
  jest.clearAllMocks();
  mockConstructGiftWrappedEvent.mockResolvedValue({
    id: "inner",
    pubkey: "sender",
    created_at: 1,
    content: "",
    kind: 14,
    tags: [],
  } as any);
  mockConstructMessageSeal.mockResolvedValue({ kind: 13 } as any);
  mockConstructMessageGiftWrap.mockResolvedValue({ kind: 1059 } as any);
  mockSendGiftWrappedMessageEvent.mockResolvedValue(undefined);
});

describe("notifySellerOfCompletedPayout", () => {
  it("sends the same order-payment DM the checkout Lightning branch sends", async () => {
    const record = makeRecord();

    await notifySellerOfCompletedPayout({
      nostr,
      signer,
      record,
      buyerPubkey: BUYER_PUBKEY,
    });

    expect(mockConstructGiftWrappedEvent).toHaveBeenCalledTimes(1);
    const [sender, recipient, message, subject, options] =
      mockConstructGiftWrappedEvent.mock.calls[0]!;
    expect(typeof sender).toBe("string");
    expect(recipient).toBe(SELLER_PUBKEY);
    expect(subject).toBe("order-payment");
    expect(message).toBe(
      buildLightningPaymentMessage({
        buyerNpub: nip19.npubEncode(BUYER_PUBKEY),
        title: "Handmade Mug",
        productDetails: " in size M (pickup at: Downtown Store)",
        lnurl: "seller@example.com",
        quantity: 2,
      })
    );
    expect(options).toMatchObject({
      isOrder: true,
      type: 2,
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
    expect(mockSendGiftWrappedMessageEvent).toHaveBeenCalledTimes(1);
    // Delivery must be verifiable: strict cache + at-least-one-relay publish,
    // so a swallowed failure can never masquerade as "seller notified".
    expect(mockSendGiftWrappedMessageEvent).toHaveBeenCalledWith(
      nostr,
      expect.anything(),
      signer,
      { requireDurableCache: true, requireRelayDelivery: true }
    );
  });

  it("falls back to a generic order message for records without captured context", async () => {
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

    await notifySellerOfCompletedPayout({
      nostr,
      signer,
      record,
      buyerPubkey: BUYER_PUBKEY,
    });

    const [, , message, subject, options] =
      mockConstructGiftWrappedEvent.mock.calls[0]!;
    expect(subject).toBe("order-payment");
    expect(message).toContain("for order order-1");
    expect(message).toContain("seller@example.com");
    expect(options).toMatchObject({
      orderId: "order-1",
      orderAmount: 1000,
      quantity: 1,
      paymentType: "lightning",
      paymentReference: "seller@example.com",
      buyerPubkey: BUYER_PUBKEY,
    });
    expect(options!.productAddress).toBeUndefined();
  });

  it("retries with fresh keys and succeeds after a transient failure", async () => {
    mockSendGiftWrappedMessageEvent
      .mockRejectedValueOnce(new Error("relay offline"))
      .mockResolvedValueOnce(undefined);

    await notifySellerOfCompletedPayout({
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

  it("throws after all attempts so the caller keeps the pending record", async () => {
    mockSendGiftWrappedMessageEvent.mockRejectedValue(
      new Error("no relays available")
    );

    await expect(
      notifySellerOfCompletedPayout({
        nostr,
        signer,
        record: makeRecord(),
        buyerPubkey: BUYER_PUBKEY,
      })
    ).rejects.toThrow("no relays available");

    expect(mockSendGiftWrappedMessageEvent).toHaveBeenCalledTimes(3);
  }, 15000);
});
