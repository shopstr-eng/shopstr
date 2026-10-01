import { generateSecretKey, getPublicKey, nip19, nip44 } from "nostr-tools";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  createArbiterGiftWrapDecryptor,
  getServerArbiterGiftWrapDecryptor,
  HodlArbiterKeyUnavailableError,
} from "@/utils/nostr/server-hodl-arbiter-decryptor";

const arbiterPrivkey = generateSecretKey();
const arbiterPubkey = getPublicKey(arbiterPrivkey);
const arbiterHex = bytesToHex(arbiterPrivkey);
const arbiterNsec = nip19.nsecEncode(arbiterPrivkey);

const senderPrivkey = generateSecretKey();
const senderPubkey = getPublicKey(senderPrivkey);

function encryptToArbiter(plaintext: string): string {
  return nip44.encrypt(
    plaintext,
    nip44.getConversationKey(senderPrivkey, arbiterPubkey)
  );
}

describe("createArbiterGiftWrapDecryptor", () => {
  it("reads a payload sealed to the arbiter, from a hex key", async () => {
    const decryptor = createArbiterGiftWrapDecryptor(arbiterHex);

    await expect(
      decryptor.decrypt(senderPubkey, encryptToArbiter("dispute payload"))
    ).resolves.toBe("dispute payload");
  });

  it("accepts an nsec too, since that is how operators usually hold the key", async () => {
    const decryptor = createArbiterGiftWrapDecryptor(arbiterNsec);

    await expect(
      decryptor.decrypt(senderPubkey, encryptToArbiter("dispute payload"))
    ).resolves.toBe("dispute payload");
  });

  it("cannot read a payload sealed to somebody else", async () => {
    const strangerPubkey = getPublicKey(generateSecretKey());
    const notForUs = nip44.encrypt(
      "someone else's dispute",
      nip44.getConversationKey(senderPrivkey, strangerPubkey)
    );

    await expect(
      createArbiterGiftWrapDecryptor(arbiterHex).decrypt(senderPubkey, notForUs)
    ).rejects.toThrow();
  });

  it("exposes decryption and nothing else", () => {
    // The key is the arbiter's signing identity. A decryptor that also
    // exposed `sign` would hand every caller the ability to publish rulings.
    expect(Object.keys(createArbiterGiftWrapDecryptor(arbiterHex))).toEqual([
      "decrypt",
    ]);
  });

  it("rejects a malformed key rather than failing later at decrypt time", () => {
    expect(() => createArbiterGiftWrapDecryptor("not-a-key")).toThrow(
      HodlArbiterKeyUnavailableError
    );
    expect(() => createArbiterGiftWrapDecryptor("nsec1garbage")).toThrow(
      HodlArbiterKeyUnavailableError
    );
  });
});

describe("getServerArbiterGiftWrapDecryptor", () => {
  const original = process.env.ARBITER_NOSTR_PRIVKEY;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ARBITER_NOSTR_PRIVKEY;
    } else {
      process.env.ARBITER_NOSTR_PRIVKEY = original;
    }
  });

  it("refuses a key rotated away from the order's committed arbiter", () => {
    process.env.ARBITER_NOSTR_PRIVKEY = arbiterHex;
    expect(() => getServerArbiterGiftWrapDecryptor(senderPubkey)).toThrow(
      HodlArbiterKeyUnavailableError
    );
    expect(() =>
      getServerArbiterGiftWrapDecryptor(arbiterPubkey)
    ).not.toThrow();
  });

  it("builds a working decryptor from the environment", async () => {
    process.env.ARBITER_NOSTR_PRIVKEY = arbiterHex;

    await expect(
      getServerArbiterGiftWrapDecryptor().decrypt(
        senderPubkey,
        encryptToArbiter("dispute payload")
      )
    ).resolves.toBe("dispute payload");
  });

  it("throws when the key is missing, so a caller cannot mistake it for an empty dispute list", () => {
    delete process.env.ARBITER_NOSTR_PRIVKEY;

    expect(() => getServerArbiterGiftWrapDecryptor()).toThrow(
      HodlArbiterKeyUnavailableError
    );
    try {
      getServerArbiterGiftWrapDecryptor();
    } catch (error) {
      expect((error as HodlArbiterKeyUnavailableError).reason).toBe(
        "arbiter_key_unavailable"
      );
    }
  });

  it("treats a blank value as missing", () => {
    process.env.ARBITER_NOSTR_PRIVKEY = "   ";

    expect(() => getServerArbiterGiftWrapDecryptor()).toThrow(
      HodlArbiterKeyUnavailableError
    );
  });

  it("never puts the key itself in the error message", () => {
    process.env.ARBITER_NOSTR_PRIVKEY = "definitely-not-a-valid-key";

    try {
      getServerArbiterGiftWrapDecryptor();
      throw new Error("expected a throw");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("ARBITER_NOSTR_PRIVKEY");
      expect(message).not.toContain("definitely-not-a-valid-key");
    }
  });
});
