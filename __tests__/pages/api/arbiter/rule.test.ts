const applyRateLimitMock = jest.fn();
const verifyNip98RequestMock = jest.fn();
const createPartialRedemptionMock = jest.fn();
const sendServerGiftWrappedDmMock = jest.fn();
const fetchDisputeEventMock = jest.fn();
const parseDisputeEventMock = jest.fn();
const signAndPublishEventMock = jest.fn();

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

jest.mock("@/utils/nostr/server-gift-wrap", () => ({
  sendServerGiftWrappedDm: (...args: unknown[]) =>
    sendServerGiftWrappedDmMock(...args),
}));

jest.mock("@/utils/nostr/dispute-records", () => ({
  fetchDisputeEvent: (...args: unknown[]) => fetchDisputeEventMock(...args),
  parseDisputeEvent: (...args: unknown[]) => parseDisputeEventMock(...args),
  createDisputeEventTemplate: (params: any) => ({
    kind: 30009,
    tags: [
      ["d", params.orderId],
      ["status", params.status],
    ],
    content: params.reason,
    created_at: 123,
  }),
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
    };
    applyRateLimitMock.mockReturnValue(true);
    createPartialRedemptionMock.mockResolvedValue({
      proofs: [{ id: "proof" }],
      partialSigs: ["arbiter-sig"],
    });
    sendServerGiftWrappedDmMock.mockResolvedValue(undefined);
    fetchDisputeEventMock.mockResolvedValue({ id: "dispute-event" });
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
    expect(fetchDisputeEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-1" })
    );
    expect(createPartialRedemptionMock).toHaveBeenCalledWith(
      "cashuAtoken",
      "arbiter-cashu-privkey"
    );
    expect(sendServerGiftWrappedDmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        senderPrivkeyHexOrNsec: "arbiter-nostr-privkey",
        recipientPubkey: "seller-nostr-pubkey",
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
        kind: 30009,
        tags: expect.arrayContaining([["status", "resolved:seller"]]),
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ success: true });
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
});
