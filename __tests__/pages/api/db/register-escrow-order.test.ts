const applyRateLimitMock = jest.fn();
const verifyNip98RequestMock = jest.fn();
const registerP2pkEscrowOrderMock = jest.fn();

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock("@/utils/nostr/nip98-auth", () => ({
  verifyNip98Request: (...args: unknown[]) => verifyNip98RequestMock(...args),
}));

jest.mock("@/utils/db/db-service", () => ({
  registerP2pkEscrowOrder: (...args: unknown[]) =>
    registerP2pkEscrowOrderMock(...args),
}));

import handler from "@/pages/api/db/register-escrow-order";

const validBody = {
  orderId: "order-1",
  sellerNostrPubkey: "2".repeat(64),
  sellerCashuPubkey: "3".repeat(64),
  buyerCashuPubkey: "4".repeat(64),
  arbiterCashuPubkey: "5".repeat(64),
  amountSats: 42,
  locktime: 2_000_000_000,
  tokenHash: "6".repeat(64),
};

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

describe("/api/db/register-escrow-order", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    applyRateLimitMock.mockReturnValue(true);
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "1".repeat(64),
    });
    registerP2pkEscrowOrderMock.mockResolvedValue("created");
  });

  it("rejects unsupported methods", async () => {
    const res = createResponse();
    await handler({ method: "GET" } as any, res as any);

    expect(res.statusCode).toBe(405);
    expect(registerP2pkEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("requires a valid NIP-98 buyer signature over the request body", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: false,
      error: "Authorization payload mismatch",
    });
    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: validBody,
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(verifyNip98RequestMock).toHaveBeenCalledWith(req, "POST");
    expect(res.statusCode).toBe(401);
    expect(registerP2pkEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("rejects malformed order commitments at runtime", async () => {
    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: { ...validBody, amountSats: "42", tokenHash: "not-a-hash" },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(registerP2pkEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("registers the authenticated buyer and immutable token commitment", async () => {
    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: validBody,
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(registerP2pkEscrowOrderMock).toHaveBeenCalledWith({
      ...validBody,
      buyerNostrPubkey: "1".repeat(64),
    });
    expect(res.statusCode).toBe(201);
    expect(res.jsonBody).toEqual({ success: true });
  });

  it("rejects a conflicting second registration for the same order id", async () => {
    registerP2pkEscrowOrderMock.mockResolvedValue("conflict");
    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: validBody,
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody).toEqual({
      error: "Escrow order is already registered with different details",
    });
  });
});
