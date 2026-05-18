jest.mock("@/utils/nostr/request-auth", () => ({
  buildClearFailedRelayPublishProof: jest.fn((obj) => ({
    ...obj,
    type: "clear",
  })),
  buildListFailedRelayPublishesProof: jest.fn((pubkey) => ({
    pubkey,
    type: "list",
  })),
  buildSignedHttpRequestProofTemplate: jest.fn((proof) => ({
    proof,
    template: true,
  })),
  buildTrackFailedRelayPublishProof: jest.fn((obj) => ({
    ...obj,
    type: "track",
  })),
  SIGNED_EVENT_HEADER: "x-signed-header",
}));

import {
  cacheEventToDatabase,
  cacheEventsToDatabase,
  deleteEventsFromDatabase,
  trackFailedRelayPublish,
  getFailedRelayPublishes,
  clearFailedRelayPublish,
} from "../db-client";

describe("db-client", () => {
  beforeEach(() => {
    // @ts-ignore
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  it("cacheEventToDatabase should POST single event", async () => {
    // @ts-ignore
    fetch.mockResolvedValue({ ok: true });
    const event = { id: "e1", kind: 1 };
    await cacheEventToDatabase(event as any);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/db/cache-event",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      })
    );
  });

  it("cacheEventsToDatabase should chunk large arrays", async () => {
    // @ts-ignore
    fetch.mockResolvedValue({ ok: true });

    const events = Array.from({ length: 60 }, (_, i) => ({
      id: `e${i}`,
      kind: 1,
    }));
    await cacheEventsToDatabase(events as any);

    expect(fetch).toHaveBeenCalledTimes(2);
    const firstCall = fetch.mock.calls[0][1];
    const secondCall = fetch.mock.calls[1][1];
    expect(JSON.parse(firstCall.body).length).toBe(50);
    expect(JSON.parse(secondCall.body).length).toBe(10);
  });

  it("cacheEventsToDatabase no-op for empty array", async () => {
    // @ts-ignore
    fetch.mockResolvedValue({ ok: true });
    await cacheEventsToDatabase([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deleteEventsFromDatabase posts with signed header", async () => {
    // @ts-ignore
    fetch.mockResolvedValue({ ok: true });
    const signedEvent = { id: "signed" } as any;
    await deleteEventsFromDatabase(["a", "b"], signedEvent as any);

    expect(fetch).toHaveBeenCalledTimes(1);
    const args = fetch.mock.calls[0];
    expect(args[0]).toBe("/api/db/delete-events");
    const options = args[1];
    expect(options.method).toBe("POST");
    expect(options.headers["x-signed-header"]).toBe(
      JSON.stringify(signedEvent)
    );
    expect(JSON.parse(options.body)).toEqual({ eventIds: ["a", "b"] });
  });

  it("trackFailedRelayPublish returns early without signer", async () => {
    // @ts-ignore
    fetch.mockResolvedValue({ ok: true });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    await trackFailedRelayPublish("id", { id: "e" } as any, ["r1"]);
    expect(warnSpy).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("trackFailedRelayPublish signs request and posts", async () => {
    // @ts-ignore
    fetch.mockResolvedValue({ ok: true });
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("pubkey"),
      sign: jest.fn().mockResolvedValue({ id: "signedEvent" }),
    } as any;

    await trackFailedRelayPublish("eid", { id: "e" } as any, ["r1"], signer);

    expect(signer.getPubKey).toHaveBeenCalled();
    expect(signer.sign).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/db/track-failed-publish",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-signed-header": JSON.stringify({ id: "signedEvent" }),
        }),
      })
    );
  });

  it("getFailedRelayPublishes returns [] without signer", async () => {
    const res = await getFailedRelayPublishes();
    expect(res).toEqual([]);
  });

  it("getFailedRelayPublishes signs request and parses json", async () => {
    const payload = [
      { eventId: "e1", relays: ["r"], event: { id: "e1" }, retryCount: 0 },
    ];
    // @ts-ignore
    fetch.mockResolvedValue({ ok: true, json: async () => payload });
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("pubkey"),
      sign: jest.fn().mockResolvedValue({ id: "signedEvent" }),
    } as any;

    const res = await getFailedRelayPublishes(signer);
    expect(res).toEqual(payload);
    expect(fetch).toHaveBeenCalledWith(
      "/api/db/get-failed-publishes",
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it("clearFailedRelayPublish returns early without signer", async () => {
    // @ts-ignore
    fetch.mockResolvedValue({ ok: true });
    await clearFailedRelayPublish("id");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("clearFailedRelayPublish signs and posts", async () => {
    // @ts-ignore
    fetch.mockResolvedValue({ ok: true });
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("pubkey"),
      sign: jest.fn().mockResolvedValue({ id: "signedEvent" }),
    } as any;

    await clearFailedRelayPublish("eid", signer, true);
    expect(fetch).toHaveBeenCalledWith(
      "/api/db/clear-failed-publish",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-signed-header": JSON.stringify({ id: "signedEvent" }),
        }),
        body: JSON.stringify({ eventId: "eid", incrementRetry: true }),
      })
    );
  });
});
