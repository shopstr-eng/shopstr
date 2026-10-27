/**
 * @jest-environment jsdom
 */
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import {
  generateOrderMessageKeys,
  sendOrderMessage,
  sendOrderMessageWithRetries,
} from "../send-order-message";
import {
  constructGiftWrappedEvent,
  constructMessageGiftWrap,
  constructMessageSeal,
  sendGiftWrappedMessageEvent,
} from "@/utils/nostr/gift-wrap";

jest.mock("@/utils/nostr/gift-wrap", () => ({
  constructGiftWrappedEvent: jest.fn(),
  constructMessageSeal: jest.fn(),
  constructMessageGiftWrap: jest.fn(),
  sendGiftWrappedMessageEvent: jest.fn(),
}));

jest.mock("@/utils/nostr/key-utilities", () => ({
  generateKeys: jest.fn(async () => {
    const sk = generateSecretKey();
    return {
      nsec: nip19.nsecEncode(sk),
      npub: nip19.npubEncode(getPublicKey(sk)),
    };
  }),
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
const RECIPIENT = "b".repeat(64);

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

describe("sendOrderMessage", () => {
  it("requires durable cache and relay delivery by default", async () => {
    const rumor = await sendOrderMessage({
      nostr,
      signer,
      recipientPubkey: RECIPIENT,
      message: "hello",
      subject: "order-payment",
      messageOptions: { isOrder: true },
    });

    expect(rumor).toBe(innerEvent);
    expect(mockSendGiftWrappedMessageEvent).toHaveBeenCalledWith(
      nostr,
      expect.anything(),
      signer,
      { requireDurableCache: true, requireRelayDelivery: true }
    );
  });

  it("sends fire-and-forget when strictDelivery is false", async () => {
    await sendOrderMessage({
      nostr,
      signer,
      recipientPubkey: RECIPIENT,
      message: "hello",
      subject: "order-payment",
      strictDelivery: false,
    });

    expect(mockSendGiftWrappedMessageEvent).toHaveBeenCalledWith(
      nostr,
      expect.anything(),
      signer,
      undefined
    );
  });

  it("uses provided ephemeral keys instead of generating fresh ones", async () => {
    const keys = await generateOrderMessageKeys();

    await sendOrderMessage({
      nostr,
      signer,
      recipientPubkey: RECIPIENT,
      message: "hello",
      subject: "order-receipt",
      keys,
    });

    expect(mockConstructGiftWrappedEvent).toHaveBeenCalledWith(
      keys.senderPubkey,
      RECIPIENT,
      "hello",
      "order-receipt",
      undefined
    );
    expect(mockConstructMessageSeal).toHaveBeenCalledWith(
      signer,
      innerEvent,
      keys.senderPubkey,
      RECIPIENT,
      keys.senderPrivkey
    );
    expect(mockConstructMessageGiftWrap).toHaveBeenCalledWith(
      { kind: 13 },
      keys.receiverPubkey,
      keys.receiverPrivkey,
      RECIPIENT
    );
  });
});

describe("sendOrderMessageWithRetries", () => {
  it("generates fresh ephemeral keys for every attempt", async () => {
    mockSendGiftWrappedMessageEvent
      .mockRejectedValueOnce(new Error("relay offline"))
      .mockResolvedValueOnce(undefined);

    await sendOrderMessageWithRetries({
      nostr,
      signer,
      recipientPubkey: RECIPIENT,
      message: "hello",
      subject: "order-payment",
    });

    expect(mockSendGiftWrappedMessageEvent).toHaveBeenCalledTimes(2);
    const firstSender = mockConstructGiftWrappedEvent.mock.calls[0]![0];
    const secondSender = mockConstructGiftWrappedEvent.mock.calls[1]![0];
    expect(secondSender).not.toBe(firstSender);
  }, 15000);

  it("reuses provided keys across attempts", async () => {
    const keys = await generateOrderMessageKeys();
    mockSendGiftWrappedMessageEvent
      .mockRejectedValueOnce(new Error("relay offline"))
      .mockResolvedValueOnce(undefined);

    await sendOrderMessageWithRetries({
      nostr,
      signer,
      recipientPubkey: RECIPIENT,
      message: "hello",
      subject: "order-payment",
      keys,
    });

    expect(mockSendGiftWrappedMessageEvent).toHaveBeenCalledTimes(2);
    for (const call of mockConstructGiftWrappedEvent.mock.calls) {
      expect(call[0]).toBe(keys.senderPubkey);
    }
  }, 15000);

  it("throws the last error after maxAttempts and runs onSuccess only on success", async () => {
    mockSendGiftWrappedMessageEvent.mockRejectedValue(
      new Error("no relays available")
    );
    const onSuccess = jest.fn();

    await expect(
      sendOrderMessageWithRetries({
        nostr,
        signer,
        recipientPubkey: RECIPIENT,
        message: "hello",
        subject: "order-payment",
        maxAttempts: 2,
        onSuccess,
      })
    ).rejects.toThrow("no relays available");

    expect(mockSendGiftWrappedMessageEvent).toHaveBeenCalledTimes(2);
    expect(onSuccess).not.toHaveBeenCalled();
  }, 15000);

  it("wraps a non-Error failure in the fallback message", async () => {
    mockSendGiftWrappedMessageEvent.mockRejectedValue("string failure");

    await expect(
      sendOrderMessageWithRetries({
        nostr,
        signer,
        recipientPubkey: RECIPIENT,
        message: "hello",
        subject: "order-payment",
        maxAttempts: 1,
        fallbackErrorMessage: "Order message failed.",
      })
    ).rejects.toThrow("Order message failed.");
  });

  it("invokes onSuccess with the rumor after a successful send", async () => {
    const onSuccess = jest.fn();

    const result = await sendOrderMessageWithRetries({
      nostr,
      signer,
      recipientPubkey: RECIPIENT,
      message: "hello",
      subject: "order-receipt",
      onSuccess,
    });

    expect(result).toBe(innerEvent);
    expect(onSuccess).toHaveBeenCalledWith(innerEvent);
  });
});
