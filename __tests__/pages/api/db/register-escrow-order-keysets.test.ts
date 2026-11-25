import { getEncodedToken, type Proof } from "@cashu/cashu-ts";

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

// Nothing is mocked below the route, so real encoded tokens go through the
// real decoder, P2PK parser and token hash.
const SELLER_CASHU_PUBKEY = `02${"3".repeat(64)}`;
const BUYER_CASHU_PUBKEY = `02${"4".repeat(64)}`;
const ARBITER_CASHU_PUBKEY = `02${"5".repeat(64)}`;
const LOCKTIME = 2_000_000_000;

const V1_KEYSET_ID = "00" + "a".repeat(14);
const V2_KEYSET_ID = "01" + "b".repeat(64);

function escrowProof(id: string, amount: number, n: number): Proof {
  return {
    id,
    amount,
    C: `02${String(n).repeat(64)}`,
    secret: JSON.stringify([
      "P2PK",
      {
        nonce: `nonce-${n}`,
        data: SELLER_CASHU_PUBKEY,
        tags: [
          ["pubkeys", BUYER_CASHU_PUBKEY, ARBITER_CASHU_PUBKEY],
          ["n_sigs", "2"],
          ["locktime", LOCKTIME.toString()],
          ["refund", BUYER_CASHU_PUBKEY],
          ["shopstr_order", "order-1"],
        ],
      },
    ]),
  } as unknown as Proof;
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

function createRequest(token: string) {
  return {
    method: "POST",
    headers: { authorization: "Nostr signed-event" },
    body: {
      token,
      sellerNostrPubkey: "2".repeat(64),
      buyerCashuPubkey: BUYER_CASHU_PUBKEY.slice(2),
    },
  } as any;
}

describe("/api/db/register-escrow-order keyset ids", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_ARBITER_PUBKEY: ARBITER_CASHU_PUBKEY,
    };
    applyRateLimitMock.mockReturnValue(true);
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "1".repeat(64),
    });
    registerP2pkEscrowOrderMock.mockResolvedValue("created");
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it.each([
    ["v1", V1_KEYSET_ID],
    ["v2", V2_KEYSET_ID],
  ])("registers an escrow token from a %s keyset mint", async (_, keysetId) => {
    const token = getEncodedToken({
      mint: "https://mint.example.com",
      proofs: [escrowProof(keysetId, 8, 1), escrowProof(keysetId, 2, 2)],
    });
    const res = createResponse();

    await handler(createRequest(token), res as any);

    expect(res.statusCode).toBe(201);
    expect(registerP2pkEscrowOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceOrderId: "order-1",
        amountSats: 10,
        locktime: LOCKTIME,
        buyerNostrPubkey: "1".repeat(64),
      })
    );
  });
});
