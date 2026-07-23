const applyRateLimitMock = jest.fn();
const verifyNip98RequestMock = jest.fn();
const createPartialRedemptionMock = jest.fn();
const sendServerGiftWrappedDmMock = jest.fn();
const fetchCachedDisputeEventsMock = jest.fn();
const fetchDisputeEventCandidatesMock = jest.fn();
const parseDisputeEventMock = jest.fn();
const selectAuthoritativeDisputeEventMock = jest.fn();
const signAndPublishEventMock = jest.fn();
const getTokenMetadataMock = jest.fn();
const getDecodedTokenMock = jest.fn();
const parseP2PKProofSetMock = jest.fn();
const getOrderParticipantsMock = jest.fn();
const getOrderAmountSatsMock = jest.fn();

jest.mock("@cashu/cashu-ts", () => ({
  getTokenMetadata: (...args: unknown[]) => getTokenMetadataMock(...args),
  getDecodedToken: (...args: unknown[]) => getDecodedTokenMock(...args),
}));

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock("@/utils/nostr/nip98-auth", () => ({
  verifyNip98Request: (...args: unknown[]) => verifyNip98RequestMock(...args),
}));

jest.mock("@/utils/cashu/dispute-redemption", () => ({
  createPartialRedemption: (...args: unknown[]) =>
    createPartialRedemptionMock(...args),
}));

jest.mock("@/utils/cashu/p2pk-checkout", () => {
  const actual = jest.requireActual("@/utils/cashu/p2pk-checkout");
  return {
    ...actual,
    parseP2PKProofSet: (...args: unknown[]) => parseP2PKProofSetMock(...args),
  };
});

jest.mock("@/utils/nostr/server-gift-wrap", () => ({
  sendServerGiftWrappedDm: (...args: unknown[]) =>
    sendServerGiftWrappedDmMock(...args),
}));

jest.mock("@/utils/nostr/dispute-records", () => ({
  fetchDisputeEventCandidates: (...args: unknown[]) =>
    fetchDisputeEventCandidatesMock(...args),
  parseDisputeEvent: (...args: unknown[]) => parseDisputeEventMock(...args),
  selectAuthoritativeDisputeEvent: (...args: unknown[]) =>
    selectAuthoritativeDisputeEventMock(...args),
  createDisputeEventTemplate: (params: any) => ({
    kind: 30407,
    tags: [
      ["d", params.orderId],
      ["status", params.status],
    ],
    content: params.reason,
    created_at: 123,
  }),
}));

jest.mock("@/utils/nostr/server-dispute-records", () => ({
  fetchCachedDisputeEvents: (...args: unknown[]) =>
    fetchCachedDisputeEventsMock(...args),
}));

jest.mock("@/utils/db/db-service", () => ({
  getOrderParticipants: (...args: unknown[]) =>
    getOrderParticipantsMock(...args),
  getOrderAmountSats: (...args: unknown[]) => getOrderAmountSatsMock(...args),
}));

jest.mock("@/utils/mcp/nostr-signing", () => ({
  McpNostrSigner: jest.fn().mockImplementation(() => ({
    getPubKey: () => "arbiter-nostr-pubkey",
  })),
  signAndPublishEvent: (...args: unknown[]) => signAndPublishEventMock(...args),
}));

jest.mock("@/utils/nostr/nostr-manager", () => ({
  NostrManager: jest.fn().mockImplementation(() => ({
    close: jest.fn(),
  })),
}));

import handler from "@/pages/api/arbiter/rule";

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

describe("/api/arbiter/rule", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      ARBITER_API_SECRET: "legacy-browser-secret",
      ARBITER_PRIVKEY: "arbiter-cashu-privkey",
      ARBITER_NOSTR_PRIVKEY: "arbiter-nostr-privkey",
      NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY: "arbiter-nostr-pubkey",
      NEXT_PUBLIC_ARBITER_PUBKEY: "a".repeat(64),
      NEXT_PUBLIC_P2PK_ESCROW_ALLOWED_MINTS: "https://mint.example",
    };
    applyRateLimitMock.mockReturnValue(true);
    getTokenMetadataMock.mockReturnValue({
      mint: "https://mint.example",
      unit: "sat",
    });
    createPartialRedemptionMock.mockResolvedValue({
      proofs: [{ id: "proof" }],
      partialSigs: ["arbiter-sig"],
    });
    getDecodedTokenMock.mockReturnValue({
      proofs: [{ amount: 10, secret: "p2pk-secret", C: "proof-C" }],
    });
    parseP2PKProofSetMock.mockReturnValue({
      p2pk: {
        pubkey: "b".repeat(64),
        pubkeys: ["c".repeat(64), "a".repeat(64)],
        nSigs: 2,
        locktime: 9999999999,
        refundKeys: ["b".repeat(64)],
        expired: false,
        rawTags: [],
        proofCount: 1,
        shopstrOrderId: "order-1",
      },
    });
    sendServerGiftWrappedDmMock.mockResolvedValue(undefined);
    fetchCachedDisputeEventsMock.mockResolvedValue([{ id: "cached-dispute" }]);
    fetchDisputeEventCandidatesMock.mockResolvedValue([
      { id: "dispute-event" },
    ]);
    getOrderParticipantsMock.mockResolvedValue({
      buyerPubkey: "buyer-nostr-pubkey",
      sellerPubkey: "seller-nostr-pubkey",
    });
    getOrderAmountSatsMock.mockResolvedValue(10);
    selectAuthoritativeDisputeEventMock.mockImplementation(
      (candidates: unknown[]) => candidates[0] ?? null
    );
    parseDisputeEventMock.mockReturnValue({
      orderId: "order-1",
      reason: "buyer opened dispute",
      buyerPubkey: "buyer-nostr-pubkey",
      sellerPubkey: "seller-nostr-pubkey",
      arbiterPubkey: "arbiter-nostr-pubkey",
      status: "open",
      createdAt: 100,
    });
    signAndPublishEventMock.mockResolvedValue({ id: "resolved-event" });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("rejects legacy bearer-secret auth even when the old secret is supplied", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: false,
      error: "Missing NIP-98 authorization header",
    });

    const req = {
      method: "POST",
      headers: { authorization: "Bearer legacy-browser-secret" },
      body: {
        orderId: "order-1",
        token: "cashuAtoken",
        rulingFor: "buyer",
        winnerNostrPubkey: "buyer-nostr-pubkey",
      },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(401);
    expect(createPartialRedemptionMock).not.toHaveBeenCalled();
    expect(sendServerGiftWrappedDmMock).not.toHaveBeenCalled();
  });

  it("requires the configured arbiter NIP-98 signer and derives the winner from the dispute event", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "arbiter-nostr-pubkey",
    });

    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: {
        orderId: "order-1",
        token: "cashuAtoken",
        rulingFor: "seller",
        winnerNostrPubkey: "attacker-chosen-pubkey",
      },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(verifyNip98RequestMock).toHaveBeenCalledWith(req, "POST");
    expect(fetchCachedDisputeEventsMock).toHaveBeenCalledWith("order-1");
    expect(fetchDisputeEventCandidatesMock).not.toHaveBeenCalled();
    expect(getOrderParticipantsMock).toHaveBeenCalledWith("order-1");
    expect(getOrderAmountSatsMock).toHaveBeenCalledWith("order-1");
    expect(getDecodedTokenMock).toHaveBeenCalledWith("cashuAtoken", []);
    expect(parseP2PKProofSetMock).toHaveBeenCalledWith([
      { amount: 10, secret: "p2pk-secret", C: "proof-C" },
    ]);
    expect(selectAuthoritativeDisputeEventMock).toHaveBeenCalledWith(
      [{ id: "cached-dispute" }],
      { buyerPubkey: "buyer-nostr-pubkey", sellerPubkey: "seller-nostr-pubkey" }
    );
    expect(createPartialRedemptionMock).toHaveBeenCalledWith(
      "cashuAtoken",
      "arbiter-cashu-privkey"
    );
    expect(sendServerGiftWrappedDmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        senderPrivkeyHexOrNsec: "arbiter-nostr-privkey",
        recipientPubkey: "seller-nostr-pubkey",
        waitForRelayPublish: false,
        payload: {
          type: "escrow-arbiter-sig",
          orderId: "order-1",
          proofs: [{ id: "proof" }],
          arbiterSigs: ["arbiter-sig"],
        },
      })
    );
    expect(sendServerGiftWrappedDmMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ recipientPubkey: "attacker-chosen-pubkey" })
    );
    expect(signAndPublishEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: 30407,
        tags: expect.arrayContaining([["status", "resolved:seller"]]),
      }),
      undefined,
      { waitForRelayPublish: false }
    );
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ success: true });
  });

  it("rejects tokens whose mint is not explicitly allowlisted before loading Cashu wallet state", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "arbiter-nostr-pubkey",
    });
    getTokenMetadataMock.mockReturnValue({
      mint: "https://evil.example",
      unit: "sat",
    });

    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: {
        orderId: "order-1",
        token: "cashuAtoken",
        rulingFor: "buyer",
      },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Token mint is not allowed for dispute escrow",
    });
    expect(fetchCachedDisputeEventsMock).not.toHaveBeenCalled();
    expect(createPartialRedemptionMock).not.toHaveBeenCalled();
  });

  it("rejects rulings when the order amount is unavailable", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "arbiter-nostr-pubkey",
    });
    getOrderAmountSatsMock.mockResolvedValue(null);

    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: {
        orderId: "order-1",
        token: "cashuAtoken",
        rulingFor: "buyer",
      },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({
      error: "Order amount is unavailable for dispute escrow",
    });
    expect(createPartialRedemptionMock).not.toHaveBeenCalled();
  });

  it("rejects rulings when the token amount does not match the order amount", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "arbiter-nostr-pubkey",
    });
    getDecodedTokenMock.mockReturnValue({
      proofs: [{ amount: 11, secret: "p2pk-secret", C: "proof-C" }],
    });

    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: {
        orderId: "order-1",
        token: "cashuAtoken",
        rulingFor: "buyer",
      },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Dispute token amount does not match the order amount",
    });
    expect(createPartialRedemptionMock).not.toHaveBeenCalled();
  });

  it("rejects rulings when the token is bound to a different order", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "arbiter-nostr-pubkey",
    });
    parseP2PKProofSetMock.mockReturnValue({
      p2pk: {
        pubkey: "b".repeat(64),
        pubkeys: ["c".repeat(64), "a".repeat(64)],
        nSigs: 2,
        locktime: 9999999999,
        refundKeys: ["b".repeat(64)],
        expired: false,
        rawTags: [],
        proofCount: 1,
        shopstrOrderId: "order-2",
      },
    });

    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: {
        orderId: "order-1",
        token: "cashuAtoken",
        rulingFor: "buyer",
      },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Dispute token is not bound to the disputed order",
    });
    expect(createPartialRedemptionMock).not.toHaveBeenCalled();
  });

  it("rejects rulings when the token has no Shopstr order binding", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "arbiter-nostr-pubkey",
    });
    parseP2PKProofSetMock.mockReturnValue({
      p2pk: {
        pubkey: "b".repeat(64),
        pubkeys: ["c".repeat(64), "a".repeat(64)],
        nSigs: 2,
        locktime: 9999999999,
        refundKeys: ["b".repeat(64)],
        expired: false,
        rawTags: [],
        proofCount: 1,
      },
    });

    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: {
        orderId: "order-1",
        token: "cashuAtoken",
        rulingFor: "buyer",
      },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Dispute token is not bound to the disputed order",
    });
    expect(createPartialRedemptionMock).not.toHaveBeenCalled();
  });

  it("rejects rulings when the token lock does not include the configured arbiter key", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "arbiter-nostr-pubkey",
    });
    parseP2PKProofSetMock.mockReturnValue({
      p2pk: {
        pubkey: "b".repeat(64),
        pubkeys: ["c".repeat(64), "d".repeat(64)],
        nSigs: 2,
        locktime: 9999999999,
        refundKeys: ["b".repeat(64)],
        expired: false,
        rawTags: [],
        proofCount: 1,
        shopstrOrderId: "order-1",
      },
    });

    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: {
        orderId: "order-1",
        token: "cashuAtoken",
        rulingFor: "buyer",
      },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: "Dispute token is not locked to the configured arbiter",
    });
    expect(createPartialRedemptionMock).not.toHaveBeenCalled();
  });

  it("fails closed when the arbiter API has no P2PK escrow mint allowlist", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "arbiter-nostr-pubkey",
    });
    delete process.env.NEXT_PUBLIC_P2PK_ESCROW_ALLOWED_MINTS;

    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: {
        orderId: "order-1",
        token: "cashuAtoken",
        rulingFor: "buyer",
      },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(400);
    expect(createPartialRedemptionMock).not.toHaveBeenCalled();
  });

  it("rejects rulings when the dispute is not open", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "arbiter-nostr-pubkey",
    });
    parseDisputeEventMock.mockReturnValue({
      orderId: "order-1",
      reason: "already resolved",
      buyerPubkey: "buyer-nostr-pubkey",
      sellerPubkey: "seller-nostr-pubkey",
      arbiterPubkey: "arbiter-nostr-pubkey",
      status: "resolved:buyer",
      createdAt: 100,
    });

    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: {
        orderId: "order-1",
        token: "cashuAtoken",
        rulingFor: "seller",
      },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(409);
    expect(createPartialRedemptionMock).not.toHaveBeenCalled();
  });

  it("falls back to relay fetch when the dispute is not cached locally", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "arbiter-nostr-pubkey",
    });
    fetchCachedDisputeEventsMock.mockResolvedValue([]);

    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: {
        orderId: "order-1",
        token: "cashuAtoken",
        rulingFor: "buyer",
      },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(fetchDisputeEventCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-1", timeoutMs: 10_000 })
    );
    expect(res.statusCode).toBe(200);
  });

  it("rejects rulings when no dispute candidate is found at all", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "arbiter-nostr-pubkey",
    });
    fetchCachedDisputeEventsMock.mockResolvedValue([]);
    fetchDisputeEventCandidatesMock.mockResolvedValue([]);

    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: {
        orderId: "order-1",
        token: "cashuAtoken",
        rulingFor: "buyer",
      },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(404);
    expect(getOrderParticipantsMock).not.toHaveBeenCalled();
    expect(createPartialRedemptionMock).not.toHaveBeenCalled();
  });

  it("rejects rulings when no candidate matches the order's authoritative buyer/seller records", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "arbiter-nostr-pubkey",
    });
    getOrderParticipantsMock.mockResolvedValue({
      buyerPubkey: "real-buyer-pubkey",
      sellerPubkey: "seller-nostr-pubkey",
    });
    selectAuthoritativeDisputeEventMock.mockReturnValue(null);

    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: {
        orderId: "order-1",
        token: "cashuAtoken",
        rulingFor: "buyer",
      },
    } as any;
    const res = createResponse();

    await handler(req, res as any);

    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({
      error: "Dispute event does not match order records",
    });
    expect(createPartialRedemptionMock).not.toHaveBeenCalled();
    expect(sendServerGiftWrappedDmMock).not.toHaveBeenCalled();
  });

  it("does not leak internal ruling errors to the client", async () => {
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "arbiter-nostr-pubkey",
    });
    createPartialRedemptionMock.mockRejectedValue(
      new Error("mint backend private detail")
    );

    const req = {
      method: "POST",
      headers: { authorization: "Nostr signed-event" },
      body: {
        orderId: "order-1",
        token: "cashuAtoken",
        rulingFor: "buyer",
      },
    } as any;
    const res = createResponse();

    try {
      await handler(req, res as any);
    } finally {
      errorSpy.mockRestore();
    }

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({ error: "Ruling failed" });
  });
});
