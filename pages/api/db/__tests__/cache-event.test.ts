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
  };
}

function createRequest(
  method: string,
  body: unknown
): NextApiRequest {
  return {
    method,
    body,
  } as unknown as NextApiRequest;
}

describe("/api/db/cache-event", () => {
  beforeEach(() => {
    verifyEventMock.mockReset();
    cacheEventMock.mockReset();
    cacheEventsMock.mockReset();
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
