/**
 * @jest-environment node
 */

const cacheEventStrictMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  cacheEventStrict: (...args: unknown[]) => cacheEventStrictMock(...args),
}));

jest.mock("@/utils/mcp/nostr-signing", () => ({
  McpRelayManager: jest.fn(),
}));

import { getPublicKey, nip44, verifyEvent } from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils.js";
import { sendServerGiftWrappedDm } from "../server-gift-wrap";

const SENDER_PRIVKEY = "1".repeat(64);
const RECIPIENT_PRIVKEY = "2".repeat(64);
const RECIPIENT_PRIVKEY_BYTES = hexToBytes(RECIPIENT_PRIVKEY);
const RECIPIENT_PUBKEY = getPublicKey(RECIPIENT_PRIVKEY_BYTES);

describe("sendServerGiftWrappedDm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheEventStrictMock.mockResolvedValue(undefined);
  });

  it("durably caches an authenticated NIP-59 seal before publishing", async () => {
    const relayManager = {
      publish: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
    } as any;
    const payload = {
      type: "escrow-arbiter-sig",
      orderId: "order-1",
      arbiterSigs: ["sig"],
      proofs: [],
    };

    await sendServerGiftWrappedDm({
      senderPrivkeyHexOrNsec: SENDER_PRIVKEY,
      recipientPubkey: RECIPIENT_PUBKEY,
      payload,
      relayManager,
    });

    expect(cacheEventStrictMock).toHaveBeenCalledTimes(1);
    const giftWrap = cacheEventStrictMock.mock.calls[0]![0];
    expect(verifyEvent(giftWrap)).toBe(true);
    expect(giftWrap.kind).toBe(1059);

    const wrapConversationKey = nip44.getConversationKey(
      RECIPIENT_PRIVKEY_BYTES,
      giftWrap.pubkey
    );
    const seal = JSON.parse(
      nip44.decrypt(giftWrap.content, wrapConversationKey)
    );
    expect(verifyEvent(seal)).toBe(true);
    expect(seal.kind).toBe(13);
    expect(seal.tags).toEqual([]);
    expect(seal.pubkey).toBe(getPublicKey(hexToBytes(SENDER_PRIVKEY)));

    const sealConversationKey = nip44.getConversationKey(
      RECIPIENT_PRIVKEY_BYTES,
      seal.pubkey
    );
    const rumor = JSON.parse(nip44.decrypt(seal.content, sealConversationKey));
    expect(rumor.pubkey).toBe(seal.pubkey);
    expect(rumor.sig).toBeUndefined();
    expect(JSON.parse(rumor.content)).toEqual(payload);
    expect(relayManager.publish).toHaveBeenCalledWith(giftWrap);
  });

  it("does not report delivery or publish when durable caching fails", async () => {
    const relayManager = {
      publish: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
    } as any;
    cacheEventStrictMock.mockRejectedValue(new Error("database unavailable"));

    await expect(
      sendServerGiftWrappedDm({
        senderPrivkeyHexOrNsec: SENDER_PRIVKEY,
        recipientPubkey: RECIPIENT_PUBKEY,
        payload: { type: "escrow-arbiter-sig", orderId: "order-1" },
        relayManager,
      })
    ).rejects.toThrow("database unavailable");
    expect(relayManager.publish).not.toHaveBeenCalled();
  });
});
