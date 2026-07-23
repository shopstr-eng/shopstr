const cacheEventMock = jest.fn();
const cacheEventStrictMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  cacheEvent: (...args: unknown[]) => cacheEventMock(...args),
  cacheEventStrict: (...args: unknown[]) => cacheEventStrictMock(...args),
}));

import { signAndPublishEvent } from "@/utils/mcp/nostr-signing";

describe("signAndPublishEvent cache durability", () => {
  const signedEvent = {
    id: "event-id",
    pubkey: "a".repeat(64),
    created_at: 1,
    kind: 30407,
    tags: [],
    content: "",
    sig: "signature",
  };
  const signer = { sign: jest.fn(() => signedEvent) };
  const relayManager = {
    publish: jest.fn(async () => undefined),
    getRelayUrls: jest.fn(() => ["wss://relay.example"]),
    close: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cacheEventMock.mockResolvedValue(undefined);
    cacheEventStrictMock.mockResolvedValue(undefined);
  });

  it("uses the strict cache path when durable caching is required", async () => {
    await signAndPublishEvent(
      signer as never,
      { kind: 30407, tags: [], content: "", created_at: 1 },
      relayManager as never,
      { requireDurableCache: true }
    );

    expect(cacheEventStrictMock).toHaveBeenCalledWith(signedEvent);
    expect(cacheEventMock).not.toHaveBeenCalled();
    expect(relayManager.publish).toHaveBeenCalledWith(signedEvent);
  });

  it("does not publish when the required cache write fails", async () => {
    cacheEventStrictMock.mockRejectedValue(new Error("database unavailable"));

    await expect(
      signAndPublishEvent(
        signer as never,
        { kind: 30407, tags: [], content: "", created_at: 1 },
        relayManager as never,
        { requireDurableCache: true }
      )
    ).rejects.toThrow("database unavailable");

    expect(relayManager.publish).not.toHaveBeenCalled();
  });
});
