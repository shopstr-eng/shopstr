const applyRateLimitMock = jest.fn();
const verifyNip98RequestMock = jest.fn();
const registerP2pkEscrowOrderMock = jest.fn();
const getDecodedTokenMock = jest.fn();
const sumProofAmountsMock = jest.fn();
const hashEscrowTokenMock = jest.fn();
const getArbiterPubkeyMock = jest.fn();
const parseP2PKProofSetMock = jest.fn();

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

jest.mock("@cashu/cashu-ts", () => ({
  ...jest.requireActual("@cashu/cashu-ts"),
  getDecodedToken: (...args: unknown[]) => getDecodedTokenMock(...args),
}));

jest.mock("@/utils/cashu/proof-amount", () => ({
  sumProofAmounts: (...args: unknown[]) => sumProofAmountsMock(...args),
}));

jest.mock("@/utils/cashu/escrow-order-commitment", () => ({
  hashEscrowToken: (...args: unknown[]) => hashEscrowTokenMock(...args),
}));

jest.mock("@/utils/cashu/p2pk-checkout", () => ({
  ...jest.requireActual("@/utils/cashu/p2pk-checkout"),
  getArbiterPubkey: (...args: unknown[]) => getArbiterPubkeyMock(...args),
  parseP2PKProofSet: (...args: unknown[]) => parseP2PKProofSetMock(...args),
}));

import handler from "@/pages/api/db/register-escrow-order";

const SELLER_CASHU_PUBKEY = "3".repeat(64);
const BUYER_CASHU_PUBKEY = "4".repeat(64);
const ARBITER_CASHU_PUBKEY = "5".repeat(64);

const validBody = {
  token: "cashuAtoken",
  sellerNostrPubkey: "2".repeat(64),
  buyerCashuPubkey: BUYER_CASHU_PUBKEY,
};

// The record is keyed by H(token); the invoice order id from the P2PK secret
// tag is stored alongside it.
const derivedCommitment = {
  orderId: "6".repeat(64),
  invoiceOrderId: "order-1",
  sellerNostrPubkey: "2".repeat(64),
  sellerCashuPubkey: SELLER_CASHU_PUBKEY,
  buyerCashuPubkey: BUYER_CASHU_PUBKEY,
  arbiterCashuPubkey: ARBITER_CASHU_PUBKEY,
  amountSats: 42,
  locktime: 2_000_000_000,
  tokenHash: "6".repeat(64),
};

function mockValidToken() {
  getDecodedTokenMock.mockReturnValue({ proofs: [{ amount: 42 }] });
  sumProofAmountsMock.mockReturnValue(42);
  hashEscrowTokenMock.mockReturnValue("6".repeat(64));
  getArbiterPubkeyMock.mockReturnValue(ARBITER_CASHU_PUBKEY);
  parseP2PKProofSetMock.mockReturnValue({
    p2pk: {
      pubkey: `02${SELLER_CASHU_PUBKEY}`,
      pubkeys: [`02${BUYER_CASHU_PUBKEY}`, `02${ARBITER_CASHU_PUBKEY}`],
      nSigs: 2,
      locktime: 2_000_000_000,
      shopstrOrderId: "order-1",
    },
  });
}

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

function createRequest(body: unknown = validBody) {
  return {
    method: "POST",
    headers: { authorization: "Nostr signed-event" },
    body,
  } as any;
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
    mockValidToken();
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
    const req = createRequest();
    const res = createResponse();

    await handler(req, res as any);

    expect(verifyNip98RequestMock).toHaveBeenCalledWith(req, "POST");
    expect(res.statusCode).toBe(401);
    expect(registerP2pkEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("rejects malformed registration bodies at runtime", async () => {
    const res = createResponse();
    await handler(
      createRequest({ token: "", sellerNostrPubkey: "nope" }),
      res as any
    );

    expect(res.statusCode).toBe(400);
    expect(registerP2pkEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("rejects tokens that fail to decode", async () => {
    getDecodedTokenMock.mockImplementation(() => {
      throw new Error("bad token");
    });
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({ error: "Invalid escrow token" });
    expect(registerP2pkEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("rejects tokens that are not locked as 2-of-3 escrow", async () => {
    parseP2PKProofSetMock.mockReturnValue({
      p2pk: {
        pubkey: `02${SELLER_CASHU_PUBKEY}`,
        pubkeys: [`02${BUYER_CASHU_PUBKEY}`],
        nSigs: 1,
        locktime: 2_000_000_000,
        shopstrOrderId: "order-1",
      },
    });
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Escrow token is not locked as 2-of-3 escrow",
    });
    expect(registerP2pkEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("rejects tokens locked to a different arbiter", async () => {
    getArbiterPubkeyMock.mockReturnValue("9".repeat(64));
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Escrow token is not locked to the configured arbiter",
    });
    expect(registerP2pkEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("rejects a claimed buyer key that is not part of the escrow lock", async () => {
    const res = createResponse();
    await handler(
      createRequest({ ...validBody, buyerCashuPubkey: "8".repeat(64) }),
      res as any
    );

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Buyer Cashu pubkey is not part of the escrow lock",
    });
    expect(registerP2pkEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("rejects tokens that are not bound to a valid order id", async () => {
    parseP2PKProofSetMock.mockReturnValue({
      p2pk: {
        pubkey: `02${SELLER_CASHU_PUBKEY}`,
        pubkeys: [`02${BUYER_CASHU_PUBKEY}`, `02${ARBITER_CASHU_PUBKEY}`],
        nSigs: 2,
        locktime: 2_000_000_000,
      },
    });
    const res = createResponse();
    await handler(createRequest(), res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Escrow token is not bound to a valid order",
    });
    expect(registerP2pkEscrowOrderMock).not.toHaveBeenCalled();
  });

  it("derives the commitment from the token and registers the authenticated buyer", async () => {
    const req = createRequest();
    const res = createResponse();

    await handler(req, res as any);

    expect(registerP2pkEscrowOrderMock).toHaveBeenCalledWith({
      ...derivedCommitment,
      buyerNostrPubkey: "1".repeat(64),
    });
    expect(res.statusCode).toBe(201);
    expect(res.jsonBody).toEqual({ success: true });
  });

  it("rejects a conflicting second registration for the same order id", async () => {
    registerP2pkEscrowOrderMock.mockResolvedValue("conflict");
    const req = createRequest();
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(409);
    expect(res.jsonBody).toEqual({
      error: "Escrow order is already registered with different details",
    });
  });

  it("keys records by token hash so a counterfeit token with the same order tag cannot squat", async () => {
    // A squatter who knows an invoice's order id can mint their own 2-of-3
    // token carrying the same shopstr_order tag — but H(counterfeit token)
    // differs from H(real token), so it lands on a different record and
    // never blocks the real buyer's registration or dispute.
    hashEscrowTokenMock.mockReturnValue("f".repeat(64));
    const res = createResponse();
    await handler(
      createRequest({ ...validBody, token: "cashuAcounterfeit" }),
      res as any
    );

    expect(res.statusCode).toBe(201);
    expect(registerP2pkEscrowOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "f".repeat(64),
        invoiceOrderId: "order-1",
        tokenHash: "f".repeat(64),
      })
    );
  });
});
