import { NostrNSecSigner } from "../nostr-nsec-signer";
import * as nostrTools from "nostr-tools";
import * as nip49 from "nostr-tools/nip49";
import CryptoJS from "crypto-js";

jest.mock("nostr-tools", () => {
  const real = jest.requireActual("nostr-tools");
  return {
    ...real,
    nip19: {
      decode: jest.fn().mockImplementation((input: string) => ({
        data: new Uint8Array([0x01, 0x02, 0x03]),
      })),
      nsecEncode: jest.fn().mockReturnValue("nsecEncodedKey"),
    },
    nip44: {
      getConversationKey: jest.fn().mockResolvedValue("mockConvKey"),
      encrypt: jest.fn().mockResolvedValue("encryptedMessage"),
      decrypt: jest.fn().mockReturnValue("decryptedMessage"),
    },
    getPublicKey: jest.fn().mockReturnValue("mockPubKey"),
    finalizeEvent: jest.fn().mockImplementation((ev: any, _sk: Uint8Array) => ({
      ...ev,
      sig: "sig",
    })),
  };
});

jest.mock("nostr-tools/nip49", () => ({
  encrypt: jest.fn().mockReturnValue("nip49Encrypted"),
  decrypt: jest.fn().mockResolvedValue(new Uint8Array([0x0a, 0x0b, 0x0c])),
}));

jest.mock("crypto-js", () => ({
  AES: {
    decrypt: jest.fn().mockImplementation((_ct: string, _pw: string) => ({
      toString: () => "0a0b0c",
    })),
  },
  enc: { Utf8: "Utf8" },
}));

describe("NostrNSecSigner", () => {
  const bytes = new Uint8Array([0x0a, 0x0b, 0x0c]);
  const hex = Buffer.from(bytes).toString("hex");
  const nsec1 = "nsec1dummy";
  const encrypted = "someEncrypted";

  const mockCH = jest
    .fn<
      Promise<{ res: string; remind: boolean }>,
      [string, string, () => void, AbortSignal, Error?]
    >()
    .mockResolvedValue({ res: "passX", remind: true });

  afterEach(() => jest.clearAllMocks());

  describe("static getEncryptedNSEC", () => {
    it("hex string input", () => {
      const out = NostrNSecSigner.getEncryptedNSEC(hex, "pw");
      expect(out.encryptedPrivKey).toBe("nip49Encrypted");
      expect(out.passphrase).toBe("pw");
      expect(out.pubkey).toBe("mockPubKey");
    });

    it("Uint8Array input", () => {
      const out = NostrNSecSigner.getEncryptedNSEC(bytes, "pw2");
      expect(out.encryptedPrivKey).toBe("nip49Encrypted");
      expect(out.passphrase).toBe("pw2");
      expect(out.pubkey).toBe("mockPubKey");
    });

    it("nsec‑prefixed string input", () => {
      // nip19.decode -> Uint8Array([1,2,3])
      const out = NostrNSecSigner.getEncryptedNSEC(nsec1, "secret!");
      expect(nostrTools.nip19.decode).toHaveBeenCalledWith(nsec1);
      expect(out.encryptedPrivKey).toBe("nip49Encrypted");
      expect(out.pubkey).toBe("mockPubKey");
    });
  });

  describe("fromJSON / toJSON", () => {
    it("returns undefined when type ≠ 'nsec'", () => {
      expect(NostrNSecSigner.fromJSON({ type: "foo" }, mockCH)).toBeUndefined();
    });

    it("returns undefined when encryptedPrivKey missing", () => {
      expect(
        NostrNSecSigner.fromJSON({ type: "nsec" }, mockCH)
      ).toBeUndefined();
    });

    it("round‑trip serialization", () => {
      const inst = NostrNSecSigner.fromJSON(
        {
          type: "nsec",
          encryptedPrivKey: encrypted,
          passphrase: "pw3",
          pubkey: "pub3",
        },
        mockCH
      )!;
      const json = inst.toJSON();
      expect(json).toEqual({
        type: "nsec",
        encryptedPrivKey: encrypted,
        pubkey: "pub3",
      });
    });
  });

  it("connect()", async () => {
    const s = new NostrNSecSigner({ encryptedPrivKey: encrypted }, mockCH);
    await expect(s.connect()).resolves.toBe("connected");
  });

  it("_getNSec() uses AES + nip19", async () => {
    const s = new NostrNSecSigner({ encryptedPrivKey: encrypted }, mockCH);
    const nsec = await s._getNSec();
    expect(CryptoJS.AES.decrypt).toHaveBeenCalledWith(encrypted, "passX");
    expect(nostrTools.nip19.nsecEncode).toHaveBeenCalledWith(
      expect.any(Uint8Array)
    );
    expect(nsec).toBe("nsecEncodedKey");
  });

  it("_getPrivKey() decrypts NIP49 format when prefix 'ncryptsec'", async () => {
    const nip49Str = "ncryptsecXYZ";
    const s = new NostrNSecSigner({ encryptedPrivKey: nip49Str }, mockCH);
    const priv = await s._getPrivKey();
    expect(nip49.decrypt).toHaveBeenCalledWith(nip49Str, "passX");
    expect(priv).toEqual(new Uint8Array([0x0a, 0x0b, 0x0c]));
    // caching behavior
    expect((s as any).rememberedPassphrase).toBe("passX");
    expect((s as any).inputPassphrase).toBe("passX");
  });

  it("getPubKey() with and without cache", async () => {
    const withCache = new NostrNSecSigner(
      { encryptedPrivKey: encrypted, pubkey: "cached" },
      mockCH
    );
    await expect(withCache.getPubKey()).resolves.toBe("cached");
    expect(nostrTools.getPublicKey).not.toHaveBeenCalled();

    const noCache = new NostrNSecSigner(
      { encryptedPrivKey: encrypted },
      mockCH
    );
    await expect(noCache.getPubKey()).resolves.toBe("mockPubKey");
    expect(nostrTools.getPublicKey).toHaveBeenCalled();
  });

  it("sign()", async () => {
    const s = new NostrNSecSigner({ encryptedPrivKey: encrypted }, mockCH);
    const ev = await s.sign({ kind: 1, content: "hey", tags: [] });
    expect(ev.sig).toBe("sig");
    expect(nostrTools.finalizeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ content: "hey" }),
      expect.any(Uint8Array)
    );
  });

  it("encrypt()/decrypt()", async () => {
    const s = new NostrNSecSigner({ encryptedPrivKey: encrypted }, mockCH);
    const ct = await s.encrypt("peerPub", "plain");
    expect(nostrTools.nip44.getConversationKey).toHaveBeenCalled();
    expect(nostrTools.nip44.encrypt).toHaveBeenCalledWith(
      "plain",
      expect.any(Promise)
    );
    expect(ct).toBe("encryptedMessage");

    const pt = await s.decrypt("peerPub", "cipher");
    expect(nostrTools.nip44.decrypt).toHaveBeenCalledWith(
      "cipher",
      expect.any(Promise)
    );
    expect(pt).toBe("decryptedMessage");
  });

  it("close()", async () => {
    const s = new NostrNSecSigner({ encryptedPrivKey: encrypted }, mockCH);
    (s as any).rememberedPassphrase = "foo";
    await s.close();
    expect((s as any).rememberedPassphrase).toBeUndefined();
  });
});
