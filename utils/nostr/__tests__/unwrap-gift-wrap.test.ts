import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip44,
} from "nostr-tools";
import { unwrapGiftWrap } from "../unwrap-gift-wrap";

const recipientSk = generateSecretKey();
const recipientPk = getPublicKey(recipientSk);

const decrypter = {
  decrypt: (pubkey: string, cipherText: string) =>
    nip44.decrypt(cipherText, nip44.getConversationKey(recipientSk, pubkey)),
};

function encryptTo(plainText: string, senderSk: Uint8Array) {
  return nip44.encrypt(
    plainText,
    nip44.getConversationKey(senderSk, recipientPk)
  );
}

function wrap(sealJson: string) {
  const wrapSk = generateSecretKey();
  return finalizeEvent(
    {
      kind: 1059,
      created_at: 1000,
      tags: [["p", recipientPk]],
      content: encryptTo(sealJson, wrapSk),
    },
    wrapSk
  );
}

function seal(rumor: unknown, sealSk: Uint8Array, kind = 13) {
  return JSON.stringify(
    finalizeEvent(
      {
        kind,
        created_at: 1000,
        tags: [],
        content: encryptTo(JSON.stringify(rumor), sealSk),
      },
      sealSk
    )
  );
}

function rumorFrom(pubkey: string) {
  return {
    id: "rumor-id",
    kind: 14,
    pubkey,
    created_at: 1000,
    content: "hello",
    tags: [
      ["p", recipientPk],
      ["subject", "listing-inquiry"],
    ],
  };
}

describe("unwrapGiftWrap", () => {
  const senderSk = generateSecretKey();
  const senderPk = getPublicKey(senderSk);

  it("returns the rumor from a well formed gift wrap", async () => {
    const rumor = rumorFrom(senderPk);
    await expect(
      unwrapGiftWrap(wrap(seal(rumor, senderSk)), decrypter)
    ).resolves.toEqual(rumor);
  });

  it("rejects a rumor whose pubkey differs from the seal signer", async () => {
    const attackerSk = generateSecretKey();
    await expect(
      unwrapGiftWrap(wrap(seal(rumorFrom(senderPk), attackerSk)), decrypter)
    ).resolves.toBeNull();
  });

  it("rejects a seal that is not kind 13", async () => {
    await expect(
      unwrapGiftWrap(wrap(seal(rumorFrom(senderPk), senderSk, 1)), decrypter)
    ).resolves.toBeNull();
  });

  it("returns null instead of throwing on undecryptable content", async () => {
    const wrapSk = generateSecretKey();
    const garbage = finalizeEvent(
      { kind: 1059, created_at: 1000, tags: [], content: "not-nip44" },
      wrapSk
    );
    await expect(unwrapGiftWrap(garbage, decrypter)).resolves.toBeNull();
  });

  it("returns null when the seal is not JSON", async () => {
    await expect(unwrapGiftWrap(wrap("{oops"), decrypter)).resolves.toBeNull();
  });

  it("returns null when the rumor has malformed tags", async () => {
    const rumor = { ...rumorFrom(senderPk), tags: ["subject", "x"] };
    await expect(
      unwrapGiftWrap(wrap(seal(rumor, senderSk)), decrypter)
    ).resolves.toBeNull();
  });

  it("returns null when a remote signer rejects the decrypt", async () => {
    const rejecting = {
      decrypt: () => Promise.reject(new Error("user denied")),
    };
    await expect(
      unwrapGiftWrap(wrap(seal(rumorFrom(senderPk), senderSk)), rejecting)
    ).resolves.toBeNull();
  });
});
