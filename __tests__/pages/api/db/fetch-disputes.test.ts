const applyRateLimitMock = jest.fn();
const fetchCachedEventsMock = jest.fn();
const verifyEventMock = jest.fn();

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock("@/utils/db/db-service", () => ({
  fetchCachedEvents: (...args: unknown[]) => fetchCachedEventsMock(...args),
}));

jest.mock("nostr-tools", () => ({
  ...jest.requireActual("nostr-tools"),
  verifyEvent: (...args: unknown[]) => verifyEventMock(...args),
}));

import handler from "@/pages/api/db/fetch-disputes";
import { DISPUTE_EVENT_KIND } from "@/utils/nostr/dispute-records";

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

const arbiter = "a".repeat(64);
const buyer = "b".repeat(64);
const seller = "c".repeat(64);

function event(params: {
  id: string;
  pubkey: string;
  status: "open" | "resolved:buyer";
  arbiterPubkey?: string;
}) {
  return {
    id: params.id,
    pubkey: params.pubkey,
    created_at: 100,
    kind: DISPUTE_EVENT_KIND,
    tags: [
      ["d", "order-1"],
      ["p", buyer, "", "buyer"],
      ["p", seller, "", "seller"],
      ["p", params.arbiterPubkey ?? arbiter, "", "arbiter"],
      ["status", params.status],
    ],
    content: "reason",
    sig: "sig",
  };
}

describe("/api/db/fetch-disputes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    applyRateLimitMock.mockReturnValue(true);
    verifyEventMock.mockReturnValue(true);
  });

  it("rejects invalid methods and pubkeys", async () => {
    const methodRes = createResponse();
    await handler({ method: "POST" } as any, methodRes as any);
    expect(methodRes.statusCode).toBe(405);

    const keyRes = createResponse();
    await handler(
      { method: "GET", query: { arbiterPubkey: "not-a-key" } } as any,
      keyRes as any
    );
    expect(keyRes.statusCode).toBe(400);
  });

  it("returns only signed events whose transition author has the claimed role", async () => {
    const open = event({ id: "open", pubkey: buyer, status: "open" });
    const forgedResolution = event({
      id: "forged-resolution",
      pubkey: seller,
      status: "resolved:buyer",
    });
    const realResolution = event({
      id: "real-resolution",
      pubkey: arbiter,
      status: "resolved:buyer",
    });
    const wrongArbiter = event({
      id: "wrong-arbiter",
      pubkey: buyer,
      status: "open",
      arbiterPubkey: "d".repeat(64),
    });
    const badSignature = event({
      id: "bad-signature",
      pubkey: buyer,
      status: "open",
    });
    fetchCachedEventsMock.mockResolvedValue([
      open,
      forgedResolution,
      realResolution,
      wrongArbiter,
      badSignature,
    ]);
    verifyEventMock.mockImplementation(
      (candidate: { id: string }) => candidate.id !== "bad-signature"
    );
    const res = createResponse();

    await handler(
      { method: "GET", query: { arbiterPubkey: arbiter } } as any,
      res as any
    );

    expect(fetchCachedEventsMock).toHaveBeenCalledWith(DISPUTE_EVENT_KIND, {
      limit: 100,
    });
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual([open, realResolution]);
  });
});
