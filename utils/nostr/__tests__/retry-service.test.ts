import { retryFailedRelayPublishes } from "../retry-service";
import { NostrNSecSigner } from "../signers/nostr-nsec-signer";
import { getFailedRelayPublishes } from "@/utils/db/db-client";

jest.mock("@/utils/db/db-client", () => ({
  getFailedRelayPublishes: jest.fn(),
  clearFailedRelayPublish: jest.fn(),
}));

jest.mock("@/utils/timeout", () => ({
  newPromiseWithTimeout: (fn: any) =>
    new Promise((resolve, reject) => fn(resolve, reject)),
}));

const getFailedRelayPublishesMock =
  getFailedRelayPublishes as jest.MockedFunction<
    typeof getFailedRelayPublishes
  >;

describe("retryFailedRelayPublishes", () => {
  const nostr = { publish: jest.fn() } as any;
  const genericSigner = {
    getPubKey: jest.fn(),
    sign: jest.fn(),
    connect: jest.fn(),
    encrypt: jest.fn(),
    decrypt: jest.fn(),
    close: jest.fn(),
    toJSON: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    getFailedRelayPublishesMock.mockResolvedValue([]);
  });

  it("does not sign in silent mode with a generic signer", async () => {
    await retryFailedRelayPublishes(nostr, genericSigner, { silent: true });

    expect(getFailedRelayPublishesMock).not.toHaveBeenCalled();
  });

  it("does not request a passphrase in silent mode for a locked nsec signer", async () => {
    const challengeHandler = jest.fn();
    const signer = new NostrNSecSigner(
      { encryptedPrivKey: "ncryptsec1locked" },
      challengeHandler
    );

    await retryFailedRelayPublishes(nostr, signer, { silent: true });

    expect(challengeHandler).not.toHaveBeenCalled();
    expect(getFailedRelayPublishesMock).not.toHaveBeenCalled();
  });

  it("allows silent retry for an already unlocked nsec signer", async () => {
    const signer = new NostrNSecSigner(
      { encryptedPrivKey: "ncryptsec1unlocked", passphrase: "test-pass" },
      jest.fn()
    );

    await retryFailedRelayPublishes(nostr, signer, { silent: true });

    expect(getFailedRelayPublishesMock).toHaveBeenCalledWith(signer);
  });

  it("preserves explicit retry behavior without silent mode", async () => {
    await retryFailedRelayPublishes(nostr, genericSigner);

    expect(getFailedRelayPublishesMock).toHaveBeenCalledWith(genericSigner);
  });
});
