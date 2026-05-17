import { NostrNIP07Signer } from "../nostr-nip07-signer";
import { NostrEventTemplate } from "@/utils/nostr/nostr-manager";

describe("NostrNIP07Signer", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const mockNostr = {
      getPublicKey: jest.fn(),
      signEvent: jest.fn(),
      nip44: {
        encrypt: jest.fn(),
        decrypt: jest.fn(),
      },
    };

    (global as any).window.nostr = mockNostr;
  });

  describe("constructor and validation", () => {
    it("should construct successfully when the extension is valid", () => {
      expect(() => new NostrNIP07Signer({})).not.toThrow();
    });

    it("should throw an error if window.nostr is not available", () => {
      delete (global as any).window.nostr;
      expect(() => new NostrNIP07Signer({})).toThrow(
        "Nostr extension not found"
      );
    });

    it("should throw an error if NIP-44 support is missing", () => {
      delete (global as any).window.nostr.nip44;
      expect(() => new NostrNIP07Signer({})).toThrow(
        "Please use a NIP-44 compatible extension like Alby or nos2x"
      );
    });
  });

  describe("fromJSON", () => {
    it("should create an instance for the correct type", () => {
      const signer = NostrNIP07Signer.fromJSON({ type: "nip07" }, jest.fn());
      expect(signer).toBeInstanceOf(NostrNIP07Signer);
    });

    it("should return undefined for an incorrect type", () => {
      const signer = NostrNIP07Signer.fromJSON({ type: "other" }, jest.fn());
      expect(signer).toBeUndefined();
    });
  });

  describe("method wrappers", () => {
    it("should call window.nostr.getPublicKey", async () => {
      (window.nostr.getPublicKey as jest.Mock).mockResolvedValue(
        "mocked-pubkey"
      );
      const signer = new NostrNIP07Signer({});

      const pubkey = await signer.getPubKey();

      expect(pubkey).toBe("mocked-pubkey");
      expect(window.nostr.getPublicKey).toHaveBeenCalledTimes(1);
    });

    it("should call window.nostr.signEvent", async () => {
      const mockEventTemplate: NostrEventTemplate = {
        kind: 1,
        content: "hello",
        tags: [],
        created_at: 123,
      };
      const mockSignedEvent = {
        ...mockEventTemplate,
        id: "id",
        sig: "sig",
        pubkey: "pk",
      };
      (window.nostr.signEvent as jest.Mock).mockResolvedValue(mockSignedEvent);

      const signer = new NostrNIP07Signer({});
      const signedEvent = await signer.sign(mockEventTemplate);

      expect(signedEvent).toEqual(mockSignedEvent);
      expect(window.nostr.signEvent).toHaveBeenCalledWith(mockEventTemplate);
      expect(window.nostr.signEvent).toHaveBeenCalledTimes(1);
    });

    it("should call window.nostr.nip44.encrypt", async () => {
      (window.nostr.nip44.encrypt as jest.Mock).mockResolvedValue(
        "encrypted-text"
      );
      const signer = new NostrNIP07Signer({});

      const encrypted = await signer.encrypt("pubkey", "plain-text");

      expect(encrypted).toBe("encrypted-text");
      expect(window.nostr.nip44.encrypt).toHaveBeenCalledWith(
        "pubkey",
        "plain-text"
      );
      expect(window.nostr.nip44.encrypt).toHaveBeenCalledTimes(1);
    });

    it("should call window.nostr.nip44.decrypt", async () => {
      (window.nostr.nip44.decrypt as jest.Mock).mockResolvedValue(
        "decrypted-text"
      );
      const signer = new NostrNIP07Signer({});

      const decrypted = await signer.decrypt("pubkey", "cipher-text");

      expect(decrypted).toBe("decrypted-text");
      expect(window.nostr.nip44.decrypt).toHaveBeenCalledWith(
        "pubkey",
        "cipher-text"
      );
      expect(window.nostr.nip44.decrypt).toHaveBeenCalledTimes(1);
    });
  });

  it("should return a JSON representation", () => {
    const signer = new NostrNIP07Signer({});
    expect(signer.toJSON()).toEqual({ type: "nip07" });
  });

  it('should return "connected" on connect', async () => {
    const signer = new NostrNIP07Signer({});
    await expect(signer.connect()).resolves.toBe("connected");
  });

  it("should resolve on close", async () => {
    const signer = new NostrNIP07Signer({});
    await expect(signer.close()).resolves.toBeUndefined();
  });
});
