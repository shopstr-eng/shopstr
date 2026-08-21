import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip44,
  verifyEvent,
} from "nostr-tools";
import {
  createGiftWrapEvent,
  type GiftWrapSigner,
} from "@/utils/nostr/gift-wrap";

const TWO_DAYS_SECONDS = 2 * 24 * 60 * 60;

function decryptGiftWrap(
  giftWrap: Awaited<ReturnType<typeof createGiftWrapEvent>>,
  recipientPrivKey: Uint8Array
) {
  const wrapConversationKey = nip44.getConversationKey(
    recipientPrivKey,
    giftWrap.pubkey
  );
  const seal = JSON.parse(nip44.decrypt(giftWrap.content, wrapConversationKey));
  const sealConversationKey = nip44.getConversationKey(
    recipientPrivKey,
    seal.pubkey
  );
  const innerContent = nip44.decrypt(seal.content, sealConversationKey);

  return { seal, innerContent };
}

function createSigner(privKey: Uint8Array): GiftWrapSigner {
  return {
    encrypt(pubkey, content) {
      const conversationKey = nip44.getConversationKey(privKey, pubkey);
      return nip44.encrypt(content, conversationKey);
    },
    sign(event) {
      return finalizeEvent(event, privKey);
    },
  };
}

describe("createGiftWrapEvent", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates a valid, decryptable gift wrap with a random seal key", async () => {
    const recipientPrivKey = generateSecretKey();
    const recipientPubkey = getPublicKey(recipientPrivKey);
    const innerContent = JSON.stringify({ kind: 14, content: "secret" });
    const nowMs = 1_750_000_000_000;
    const nowSeconds = Math.floor(nowMs / 1000);
    const sealRandomOffset = 0.25;
    const wrapRandomOffset = 0.75;
    jest.spyOn(Date, "now").mockReturnValue(nowMs);
    const randomSpy = jest
      .spyOn(Math, "random")
      .mockReturnValueOnce(sealRandomOffset)
      .mockReturnValueOnce(wrapRandomOffset);

    const giftWrap = await createGiftWrapEvent(innerContent, recipientPubkey);
    const { seal, innerContent: decryptedInnerContent } = decryptGiftWrap(
      giftWrap,
      recipientPrivKey
    );

    expect(verifyEvent(JSON.parse(JSON.stringify(giftWrap)))).toBe(true);
    expect(verifyEvent(seal)).toBe(true);
    expect(giftWrap.kind).toBe(1059);
    expect(giftWrap.tags).toEqual([["p", recipientPubkey]]);
    expect(seal.kind).toBe(13);
    expect(seal.tags).toEqual([]);
    expect(giftWrap.pubkey).not.toBe(seal.pubkey);
    expect(decryptedInnerContent).toBe(innerContent);
    expect(seal.created_at).toBe(
      nowSeconds - Math.floor(sealRandomOffset * TWO_DAYS_SECONDS)
    );
    expect(giftWrap.created_at).toBe(
      nowSeconds - Math.floor(wrapRandomOffset * TWO_DAYS_SECONDS)
    );
    expect(randomSpy).toHaveBeenCalledTimes(2);
    expect(() => decryptGiftWrap(giftWrap, generateSecretKey())).toThrow();
  });

  it("uses the signer for the seal and includes a relay hint", async () => {
    const senderPrivKey = generateSecretKey();
    const recipientPrivKey = generateSecretKey();
    const recipientPubkey = getPublicKey(recipientPrivKey);
    const relayHint = "wss://relay.example.com";
    const innerContent = "sender-authenticated rumor";

    const giftWrap = await createGiftWrapEvent(innerContent, recipientPubkey, {
      signer: createSigner(senderPrivKey),
      relayHint,
    });
    const { seal, innerContent: decryptedInnerContent } = decryptGiftWrap(
      giftWrap,
      recipientPrivKey
    );

    expect(giftWrap.tags).toEqual([["p", recipientPubkey, relayHint]]);
    expect(seal.pubkey).toBe(getPublicKey(senderPrivKey));
    expect(giftWrap.pubkey).not.toBe(seal.pubkey);
    expect(seal.kind).toBe(13);
    expect(seal.tags).toEqual([]);
    expect(verifyEvent(seal)).toBe(true);
    expect(decryptedInnerContent).toBe(innerContent);
  });

  it("uses an injected random key for the seal", async () => {
    const sealPrivKey = generateSecretKey();
    const recipientPrivKey = generateSecretKey();
    const recipientPubkey = getPublicKey(recipientPrivKey);

    const giftWrap = await createGiftWrapEvent("rumor", recipientPubkey, {
      randomPrivKey: sealPrivKey,
    });
    const { seal, innerContent } = decryptGiftWrap(giftWrap, recipientPrivKey);

    expect(seal.pubkey).toBe(getPublicKey(sealPrivKey));
    expect(giftWrap.pubkey).not.toBe(seal.pubkey);
    expect(seal.kind).toBe(13);
    expect(seal.tags).toEqual([]);
    expect(verifyEvent(seal)).toBe(true);
    expect(innerContent).toBe("rumor");
  });

  it("generates a fresh wrapper key for every gift wrap", async () => {
    const recipientPubkey = getPublicKey(generateSecretKey());

    const first = await createGiftWrapEvent("same rumor", recipientPubkey);
    const second = await createGiftWrapEvent("same rumor", recipientPubkey);

    expect(first.pubkey).not.toBe(second.pubkey);
  });

  it("rejects ambiguous seal signing options", async () => {
    const randomPrivKey = generateSecretKey();
    const signer = createSigner(generateSecretKey());
    const recipientPubkey = getPublicKey(generateSecretKey());

    await expect(
      createGiftWrapEvent("rumor", recipientPubkey, {
        randomPrivKey,
        signer,
      })
    ).rejects.toThrow(
      "createGiftWrapEvent: randomPrivKey and signer are mutually exclusive"
    );
  });
});
