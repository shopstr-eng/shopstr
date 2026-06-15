import { waitFor } from "@testing-library/react";
import { createNostrProfileEvent } from "../nostr-helper-functions";
import {
  cacheEventToDatabase,
  trackFailedRelayPublish,
} from "@/utils/db/db-client";
import type { NostrManager } from "../nostr-manager";
import type { NostrSigner } from "../signers/nostr-signer";

type TimeoutExecutor<T> = (
  resolve: (value: T) => void,
  reject: (reason?: unknown) => void,
  abortSignal: AbortSignal
) => unknown;
type ProfileSigner = Pick<NostrSigner, "getPubKey" | "sign">;
type ProfilePublisher = Pick<NostrManager, "publish"> & {
  publish: jest.MockedFunction<NostrManager["publish"]>;
};

jest.mock("@/utils/db/db-client", () => ({
  cacheEventToDatabase: jest.fn().mockResolvedValue(undefined),
  deleteEventsFromDatabase: jest.fn(),
  trackFailedRelayPublish: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/utils/timeout", () => ({
  newPromiseWithTimeout: <T>(fn: TimeoutExecutor<T>) =>
    new Promise<T>((resolve, reject) =>
      fn(resolve, reject, new AbortController().signal)
    ),
}));

const mockCacheEventToDatabase = cacheEventToDatabase as jest.Mock;
const mockTrackFailedRelayPublish = trackFailedRelayPublish as jest.Mock;

describe("createNostrProfileEvent", () => {
  const signedEvent = {
    id: "profile-event-1",
    pubkey: "user-pubkey",
    created_at: 12345,
    kind: 0,
    tags: [],
    content: '{"name":"alice"}',
    sig: "sig",
  };

  const signer: ProfileSigner = {
    sign: jest.fn().mockResolvedValue(signedEvent),
    getPubKey: jest.fn().mockResolvedValue("user-pubkey"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem(
      "writeRelays",
      JSON.stringify(["wss://relay.example"])
    );
    localStorage.setItem("relays", JSON.stringify([]));
  });

  test("caches the signed profile event once and resolves before relay publish settles", async () => {
    let resolvePublish!: () => void;
    const nostr: ProfilePublisher = {
      publish: jest.fn().mockReturnValue(
        new Promise<void>((resolve) => {
          resolvePublish = resolve;
        })
      ),
    };

    const profileSavePromise = createNostrProfileEvent(
      nostr,
      signer,
      signedEvent.content
    );
    const result = await profileSavePromise;

    expect(result).toEqual(signedEvent);
    expect(mockCacheEventToDatabase).toHaveBeenCalledTimes(1);
    expect(mockCacheEventToDatabase).toHaveBeenCalledWith(signedEvent);
    expect(nostr.publish).toHaveBeenCalledTimes(1);

    resolvePublish();
  });

  test("tracks failed relay publishes in the background without rejecting the caller", async () => {
    const publishError = new Error("relay failed");
    const nostr: ProfilePublisher = {
      publish: jest.fn().mockRejectedValue(publishError),
    };

    await expect(
      createNostrProfileEvent(nostr, signer, signedEvent.content)
    ).resolves.toEqual(signedEvent);

    await waitFor(() => {
      expect(mockTrackFailedRelayPublish).toHaveBeenCalledWith(
        signedEvent.id,
        signedEvent,
        expect.arrayContaining([
          "wss://relay.example",
          "wss://sendit.nosflare.com",
        ]),
        signer
      );
    });
  });
});
