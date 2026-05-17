import type { NextApiRequest, NextApiResponse } from "next";

const verifyEventMock = jest.fn();
const cacheEventMock = jest.fn();
const cacheEventsMock = jest.fn();

jest.mock("nostr-tools", () => ({
  verifyEvent: (...args: unknown[]) => verifyEventMock(...args),
}));

jest.mock("@/utils/db/db-service", () => ({
  cacheEvent: (...args: unknown[]) => cacheEventMock(...args),
  cacheEvents: (...args: unknown[]) => cacheEventsMock(...args),
}));

import cacheEventHandler from "@/pages/api/db/cache-event";
import cacheEventsHandler from "@/pages/api/db/cache-events";
import { __resetRateLimitBuckets } from "@/utils/rate-limit";

function createResponse() {
  return {
    statusCode: 200,
    jsonBody: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      return this;
    },
    setHeader() {
      return this;
    },
  };
}

function createRequest(method: string, body: unknown): NextApiRequest {
  return {
    method,
    body,
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as NextApiRequest;
}

describe("/api/db/cache-event", () => {
  beforeEach(() => {
    verifyEventMock.mockReset();
    cacheEventMock.mockReset();
    cacheEventsMock.mockReset();
    __resetRateLimitBuckets();
  });

  it("rejects forged single-event cache writes", async () => {
    verifyEventMock.mockReturnValue(false);

    const req = createRequest("POST", {
      id: "evt-forged",
      pubkey: "attacker-pubkey",
      kind: 30019,
      content: "{}",
    });
    const res = createResponse();

    await cacheEventHandler(req, res as unknown as NextApiResponse);

    expect(cacheEventMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toEqual({
      error: "Invalid or unsigned Nostr event",
    });
  });

  it("rejects single-event writes with disallowed kinds", async () => {
    verifyEventMock.mockReturnValue(true);

    const req = createRequest("POST", {
      id: "evt-wrong-kind",
      pubkey: "attacker-pubkey",
      kind: 1,
      content: "spam",
    });
    const res = createResponse();

    await cacheEventHandler(req, res as unknown as NextApiResponse);

    expect(cacheEventMock).not.toHaveBeenCalled();
    expect(verifyEventMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Event kind is not permitted for caching",
    });
  });

  it("accepts signed contact list cache writes", async () => {
    verifyEventMock.mockReturnValue(true);
    cacheEventMock.mockResolvedValue(undefined);

    const event = {
      id: "evt-contact-list",
      pubkey: "follower-pubkey",
      kind: 3,
      tags: [["p", "seller-pubkey"]],
      content: "",
      sig: "sig-contact-list",
    };
    const req = createRequest("POST", event);
    const res = createResponse();

    await cacheEventHandler(req, res as unknown as NextApiResponse);

    expect(cacheEventMock).toHaveBeenCalledWith(event);
    expect(res.statusCode).toBe(200);
  });

  it("rejects batch writes containing disallowed kinds", async () => {
    verifyEventMock.mockReturnValue(true);

    const req = createRequest("POST", [
      {
        id: "evt-good",
        pubkey: "pubkey-1",
        kind: 30019,
        content: "{}",
      },
      {
        id: "evt-wrong-kind",
        pubkey: "pubkey-2",
        kind: 1,
        content: "spam",
      },
    ]);
    const res = createResponse();

    await cacheEventsHandler(req, res as unknown as NextApiResponse);

    expect(cacheEventsMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Event kind is not permitted for caching",
    });
  });

  it("throttles per pubkey, not per IP, so NAT-shared buyers don't trip each other", async () => {
    verifyEventMock.mockReturnValue(true);
    cacheEventMock.mockResolvedValue(undefined);

    const makeReq = (pubkey: string) => {
      const r = createRequest("POST", {
        id: "evt-ok",
        pubkey,
        kind: 30019,
        content: "{}",
      });
      (r as any).headers = { "x-forwarded-for": "10.0.0.1" };
      (r as any).socket = { remoteAddress: "10.0.0.1" };
      return r;
    };

    // One shopper bursts up to the per-pubkey limit (600/min).
    for (let i = 0; i < 600; i++) {
      const res = createResponse();
      await cacheEventHandler(
        makeReq("buyer-1"),
        res as unknown as NextApiResponse
      );
      expect(res.statusCode).toBe(200);
    }

    const denied = createResponse();
    await cacheEventHandler(
      makeReq("buyer-1"),
      denied as unknown as NextApiResponse
    );
    expect(denied.statusCode).toBe(429);

    // A different shopper behind the *same* IP (CGNAT/office) is unaffected.
    const sharedIpOtherBuyer = createResponse();
    await cacheEventHandler(
      makeReq("buyer-2"),
      sharedIpOtherBuyer as unknown as NextApiResponse
    );
    expect(sharedIpOtherBuyer.statusCode).toBe(200);
  });

  it("enforces a coarse per-IP ceiling as a DoS backstop", async () => {
    verifyEventMock.mockReturnValue(true);
    cacheEventMock.mockResolvedValue(undefined);

    // Rotate pubkeys per request so we only trip the IP limit (2000/min),
    // not the per-pubkey limit.
    const makeReq = (i: number) => {
      const r = createRequest("POST", {
        id: `evt-${i}`,
        pubkey: `pubkey-${i}`,
        kind: 30019,
        content: "{}",
      });
      (r as any).headers = { "x-forwarded-for": "10.0.0.9" };
      (r as any).socket = { remoteAddress: "10.0.0.9" };
      return r;
    };

    for (let i = 0; i < 2000; i++) {
      const res = createResponse();
      await cacheEventHandler(makeReq(i), res as unknown as NextApiResponse);
      expect(res.statusCode).toBe(200);
    }

    const denied = createResponse();
    await cacheEventHandler(
      makeReq(9999),
      denied as unknown as NextApiResponse
    );
    expect(denied.statusCode).toBe(429);
  });

  it("rejects forged batch cache writes", async () => {
    verifyEventMock.mockImplementation((event: { id: string }) => {
      return event.id !== "evt-forged";
    });

    const req = createRequest("POST", [
      {
        id: "evt-good",
        pubkey: "pubkey-1",
        kind: 30019,
        content: "{}",
      },
      {
        id: "evt-forged",
        pubkey: "pubkey-2",
        kind: 30019,
        content: "{}",
      },
    ]);
    const res = createResponse();

    await cacheEventsHandler(req, res as unknown as NextApiResponse);

    expect(cacheEventsMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toEqual({
      error: "Invalid or unsigned Nostr event",
    });
  });
});
