import { NostrNIP07Signer } from "../nostr-nip07-signer";
import { NostrEventTemplate } from "@/utils/nostr/nostr-manager";
import type { NostrExtensionProvider } from "@/utils/types/types";

type MockNostrProvider = Omit<NostrExtensionProvider, "nip44"> & {
  getPublicKey: jest.MockedFunction<NostrExtensionProvider["getPublicKey"]>;
  signEvent: jest.MockedFunction<NostrExtensionProvider["signEvent"]>;
  nip44: {
    encrypt: jest.MockedFunction<
      NonNullable<NostrExtensionProvider["nip44"]>["encrypt"]
    >;
    decrypt: jest.MockedFunction<
      NonNullable<NostrExtensionProvider["nip44"]>["decrypt"]
    >;
  };
};

function setNostrProvider(
  provider: NostrExtensionProvider | Partial<NostrExtensionProvider> | undefined
) {
  Object.defineProperty(window, "nostr", {
    value: provider,
    configurable: true,
    writable: true,
  });
}

function getMockNostr(): MockNostrProvider {
  if (!window.nostr) {
    throw new Error("Missing mock Nostr extension");
  }
  return window.nostr as MockNostrProvider;
}

describe("NostrNIP07Signer", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const mockNostr: MockNostrProvider = {
      getPublicKey: jest.fn(),
      signEvent: jest.fn(),
      nip44: {
        encrypt: jest.fn(),
        decrypt: jest.fn(),
      },
    };

    setNostrProvider(mockNostr);
  });

  describe("constructor and validation", () => {
    it("should construct successfully when the extension is valid", () => {
      expect(() => new NostrNIP07Signer({})).not.toThrow();
    });

    it("should throw an error if window.nostr is not available", () => {
      setNostrProvider(undefined);
      expect(() => new NostrNIP07Signer({})).toThrow(
        "Nostr extension not found"
      );
    });

    it("should throw an error if NIP-44 support is missing", () => {
      setNostrProvider({
        getPublicKey: jest.fn(),
        signEvent: jest.fn(),
      });
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
      const nostr = getMockNostr();
      nostr.getPublicKey.mockResolvedValue("mocked-pubkey");
      const signer = new NostrNIP07Signer({});

      const pubkey = await signer.getPubKey();

      expect(pubkey).toBe("mocked-pubkey");
      expect(nostr.getPublicKey).toHaveBeenCalledTimes(1);
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
      const nostr = getMockNostr();
      nostr.signEvent.mockResolvedValue(mockSignedEvent);

      const signer = new NostrNIP07Signer({});
      const signedEvent = await signer.sign(mockEventTemplate);

      expect(signedEvent).toEqual(mockSignedEvent);
      expect(nostr.signEvent).toHaveBeenCalledWith(mockEventTemplate);
      expect(nostr.signEvent).toHaveBeenCalledTimes(1);
    });

    it("should call window.nostr.nip44.encrypt", async () => {
      const nostr = getMockNostr();
      nostr.nip44.encrypt.mockResolvedValue("encrypted-text");
      const signer = new NostrNIP07Signer({});

      const encrypted = await signer.encrypt("pubkey", "plain-text");

      expect(encrypted).toBe("encrypted-text");
      expect(nostr.nip44.encrypt).toHaveBeenCalledWith("pubkey", "plain-text");
      expect(nostr.nip44.encrypt).toHaveBeenCalledTimes(1);
    });

    it("should call window.nostr.nip44.decrypt", async () => {
      const nostr = getMockNostr();
      nostr.nip44.decrypt.mockResolvedValue("decrypted-text");
      const signer = new NostrNIP07Signer({});

      const decrypted = await signer.decrypt("pubkey", "cipher-text");

      expect(decrypted).toBe("decrypted-text");
      expect(nostr.nip44.decrypt).toHaveBeenCalledWith("pubkey", "cipher-text");
      expect(nostr.nip44.decrypt).toHaveBeenCalledTimes(1);
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
