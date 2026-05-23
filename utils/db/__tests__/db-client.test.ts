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
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("cacheEventToDatabase should POST single event", async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    const event = { id: "e1", kind: 1 };
    await cacheEventToDatabase(event as any);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/db/cache-event",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      })
    );
  });

  it("cacheEventsToDatabase should chunk large arrays", async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);

    const events = Array.from({ length: 60 }, (_, i) => ({
      id: `e${i}`,
      kind: 1,
    }));
    await cacheEventsToDatabase(events as any);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstCall = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const secondCall = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    expect(firstCall).toBeDefined();
    expect(secondCall).toBeDefined();
    expect(JSON.parse(firstCall!.body as string).length).toBe(50);
    expect(JSON.parse(secondCall!.body as string).length).toBe(10);
  });

  it("cacheEventsToDatabase no-op for empty array", async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    await cacheEventsToDatabase([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deleteEventsFromDatabase posts with signed header", async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    const signedEvent = { id: "signed" } as any;
    await deleteEventsFromDatabase(["a", "b"], signedEvent as any);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const args = fetchMock.mock.calls[0];
    expect(args).toBeDefined();
    const [url, options] = args!;
    expect(url).toBe("/api/db/delete-events");
    expect(options).toBeDefined();
    const requestOptions = options as RequestInit;
    expect(requestOptions.method).toBe("POST");
    expect(
      (requestOptions.headers as Record<string, string>)["x-signed-header"]
    ).toBe(JSON.stringify(signedEvent));
    expect(JSON.parse(requestOptions.body as string)).toEqual({
      eventIds: ["a", "b"],
    });
  });

  it("trackFailedRelayPublish returns early without signer", async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    await trackFailedRelayPublish("id", { id: "e" } as any, ["r1"]);
    expect(warnSpy).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("trackFailedRelayPublish signs request and posts", async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("pubkey"),
      sign: jest.fn().mockResolvedValue({ id: "signedEvent" }),
    } as any;

    await trackFailedRelayPublish("eid", { id: "e" } as any, ["r1"], signer);

    expect(signer.getPubKey).toHaveBeenCalled();
    expect(signer.sign).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
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
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => payload,
    } as Response);
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("pubkey"),
      sign: jest.fn().mockResolvedValue({ id: "signedEvent" }),
    } as any;

    const res = await getFailedRelayPublishes(signer);
    expect(res).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/db/get-failed-publishes",
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it("clearFailedRelayPublish returns early without signer", async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    await clearFailedRelayPublish("id");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clearFailedRelayPublish signs and posts", async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("pubkey"),
      sign: jest.fn().mockResolvedValue({ id: "signedEvent" }),
    } as any;

    await clearFailedRelayPublish("eid", signer, true);
    expect(fetchMock).toHaveBeenCalledWith(
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

  // Error / catch branches
  it("cacheEventToDatabase logs error when response not ok", async () => {
    fetchMock.mockResolvedValue({ ok: false } as Response);
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await cacheEventToDatabase({ id: "e2" } as any);
    expect(errSpy).toHaveBeenCalledWith("Failed to cache event to database");
    errSpy.mockRestore();
  });

  it("cacheEventToDatabase logs error when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await cacheEventToDatabase({ id: "e3" } as any);
    expect(errSpy).toHaveBeenCalled();
    expect(errSpy.mock.calls[0]?.[0]).toMatch(
      /Failed to cache event to database:/
    );
    errSpy.mockRestore();
  });

  it("cacheEventsToDatabase logs error when a chunk response is not ok", async () => {
    // first chunk ok, second chunk not ok
    fetchMock
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({ ok: false } as Response);
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const events = Array.from({ length: 55 }, (_, i) => ({ id: `e${i}` }));
    await cacheEventsToDatabase(events as any);
    expect(errSpy).toHaveBeenCalledWith("Failed to cache events to database");
    errSpy.mockRestore();
  });

  it("cacheEventsToDatabase logs error when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("boom"));
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await cacheEventsToDatabase([{ id: "x" }] as any);
    expect(errSpy).toHaveBeenCalled();
    expect(errSpy.mock.calls[0]?.[0]).toMatch(
      /Failed to cache events to database:/
    );
    errSpy.mockRestore();
  });

  it("deleteEventsFromDatabase no-op for empty list", async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    await deleteEventsFromDatabase([], { id: "s" } as any);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("getFailedRelayPublishes handles non-ok response and returns []", async () => {
    fetchMock.mockResolvedValue({ ok: false } as Response);
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("pubkey"),
      sign: jest.fn().mockResolvedValue({ id: "signedEvent" }),
    } as any;
    const res = await getFailedRelayPublishes(signer);
    expect(res).toEqual([]);
    expect(errSpy).toHaveBeenCalledWith(
      "Failed to fetch failed relay publishes"
    );
    errSpy.mockRestore();
  });

  it("getFailedRelayPublishes handles fetch throw and returns []", async () => {
    fetchMock.mockRejectedValue(new Error("net"));
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("pubkey"),
      sign: jest.fn().mockResolvedValue({ id: "signedEvent" }),
    } as any;
    const res = await getFailedRelayPublishes(signer);
    expect(res).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  // Signer sync / throw edge cases
  it("trackFailedRelayPublish supports synchronous signer methods", async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    const signer = {
      getPubKey: () => "pubkey",
      sign: (_uEv: any) => ({ id: "signedSync" }),
    } as any;
    await trackFailedRelayPublish(
      "eid-sync",
      { id: "e" } as any,
      ["r1"],
      signer
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/db/track-failed-publish",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-signed-header": JSON.stringify({ id: "signedSync" }),
        }),
      })
    );
  });

  it("trackFailedRelayPublish logs and swallows if signer.sign throws", async () => {
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("pubkey"),
      sign: jest.fn().mockImplementation(() => {
        throw new Error("sign-fail");
      }),
    } as any;
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await trackFailedRelayPublish(
      "eid-err",
      { id: "e" } as any,
      ["r1"],
      signer
    );
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("clearFailedRelayPublish supports synchronous signer methods", async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response);
    const signer = {
      getPubKey: () => "pubkey",
      sign: (_uEv: any) => ({ id: "signedSync" }),
    } as any;
    await clearFailedRelayPublish("eid-sync", signer, false);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/db/clear-failed-publish",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-signed-header": JSON.stringify({ id: "signedSync" }),
        }),
      })
    );
  });

  it("clearFailedRelayPublish logs and swallows if signer.sign throws", async () => {
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("pubkey"),
      sign: jest.fn().mockImplementation(() => {
        throw new Error("sign-err");
      }),
    } as any;
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await clearFailedRelayPublish("eid-err", signer, false);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("deleteEventsFromDatabase logs error when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("del-err"));
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await deleteEventsFromDatabase(["z"], { id: "s" } as any);
    expect(errSpy).toHaveBeenCalledWith(
      "Failed to delete events from database:",
      expect.any(Error)
    );
    errSpy.mockRestore();
  });
});
