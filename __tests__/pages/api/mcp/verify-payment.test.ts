import type { NextApiRequest, NextApiResponse } from "next";

const authenticateRequestMock = jest.fn();
const initializeApiKeysTableMock = jest.fn();
const applyRateLimitMock = jest.fn();
const recordRequestMock = jest.fn();

const getMcpOrderMock = jest.fn();
const updateMcpOrderPaymentMock = jest.fn();
const getMcpLightningPaymentMock = jest.fn();
const claimMcpLightningMintMock = jest.fn();
const releaseMcpLightningClaimMock = jest.fn();
const setMcpLightningTokenMock = jest.fn();

const mintPaidQuoteMock = jest.fn();
const sendOrderPaymentDmMock = jest.fn();

const loadMintMock = jest.fn();
const checkMintQuoteMock = jest.fn();

jest.mock("@/utils/mcp/auth", () => ({
  authenticateRequest: (...args: unknown[]) => authenticateRequestMock(...args),
  initializeApiKeysTable: (...args: unknown[]) =>
    initializeApiKeysTableMock(...args),
}));

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock("@/utils/mcp/metrics", () => ({
  recordRequest: (...args: unknown[]) => recordRequestMock(...args),
}));

jest.mock("@/mcp/tools/purchase-tools", () => ({
  getMcpOrder: (...args: unknown[]) => getMcpOrderMock(...args),
  updateMcpOrderPayment: (...args: unknown[]) =>
    updateMcpOrderPaymentMock(...args),
  getMcpLightningPayment: (...args: unknown[]) =>
    getMcpLightningPaymentMock(...args),
  claimMcpLightningMint: (...args: unknown[]) =>
    claimMcpLightningMintMock(...args),
  releaseMcpLightningClaim: (...args: unknown[]) =>
    releaseMcpLightningClaimMock(...args),
  setMcpLightningToken: (...args: unknown[]) =>
    setMcpLightningTokenMock(...args),
}));

jest.mock("@/utils/mcp/order-payment", () => ({
  mintPaidQuote: (...args: unknown[]) => mintPaidQuoteMock(...args),
  sendOrderPaymentDm: (...args: unknown[]) => sendOrderPaymentDmMock(...args),
}));

jest.mock("@cashu/cashu-ts", () => ({
  Mint: jest.fn().mockImplementation(() => ({})),
  Wallet: jest.fn().mockImplementation(() => ({
    loadMint: (...args: unknown[]) => loadMintMock(...args),
    checkMintQuoteBolt11: (...args: unknown[]) => checkMintQuoteMock(...args),
  })),
  MintQuoteState: { UNPAID: "UNPAID", PAID: "PAID", ISSUED: "ISSUED" },
}));

import { Mint, Wallet } from "@cashu/cashu-ts";
import handler from "@/pages/api/mcp/verify-payment";

const BUYER = "b".repeat(64);
const SELLER = "c".repeat(64);
const MINT = "https://mint.example.com";

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    order_id: "mcp_1",
    buyer_pubkey: BUYER,
    seller_pubkey: SELLER,
    product_title: "Honey",
    quantity: 2,
    shipping_address: { name: "Ann" },
    payment_status: "pending",
    ...overrides,
  };
}

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    order_id: "mcp_1",
    quote_id: "quote-1",
    mint_url: MINT,
    amount_sats: 1000,
    product_address: `30402:${SELLER}:listing-1`,
    selected_specs: { size: "L" },
    seller_token: null,
    claim_age_seconds: null,
    ...overrides,
  };
}

function createResponse() {
  const res = {
    statusCode: 200,
    jsonBody: undefined as any,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.jsonBody = payload;
      return res;
    },
    setHeader() {
      return res;
    },
    end() {
      return res;
    },
  };
  return res;
}

async function verify(body: Record<string, unknown> = { orderId: "mcp_1" }) {
  const req = {
    method: "POST",
    headers: {},
    body,
    query: {},
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as NextApiRequest;
  const res = createResponse();
  await handler(req, res as unknown as NextApiResponse);
  return res;
}

beforeEach(() => {
  jest.resetAllMocks();
  (Mint as unknown as jest.Mock).mockImplementation(() => ({}));
  (Wallet as unknown as jest.Mock).mockImplementation(() => ({
    loadMint: (...args: unknown[]) => loadMintMock(...args),
    checkMintQuoteBolt11: (...args: unknown[]) => checkMintQuoteMock(...args),
  }));
  applyRateLimitMock.mockReturnValue(true);
  initializeApiKeysTableMock.mockResolvedValue(undefined);
  authenticateRequestMock.mockResolvedValue({
    id: 1,
    pubkey: BUYER,
    encrypted_nsec: "enc",
  });
  getMcpOrderMock.mockResolvedValue(makeOrder());
  getMcpLightningPaymentMock.mockResolvedValue(makePayment());
  loadMintMock.mockResolvedValue(undefined);
  checkMintQuoteMock.mockResolvedValue({ state: "PAID" });
  claimMcpLightningMintMock.mockResolvedValue(true);
  mintPaidQuoteMock.mockResolvedValue("cashuBminted");
  sendOrderPaymentDmMock.mockResolvedValue(undefined);
  setMcpLightningTokenMock.mockResolvedValue(undefined);
  updateMcpOrderPaymentMock.mockResolvedValue(undefined);
  releaseMcpLightningClaimMock.mockResolvedValue(undefined);
});

describe("verify-payment (Lightning)", () => {
  it("looks the payment up in the database, not in memory", async () => {
    await verify();

    expect(getMcpLightningPaymentMock).toHaveBeenCalledWith("mcp_1");
  });

  it("returns 400 when the order has no Lightning payment", async () => {
    getMcpLightningPaymentMock.mockResolvedValue(null);

    const res = await verify();

    expect(res.statusCode).toBe(400);
    expect(mintPaidQuoteMock).not.toHaveBeenCalled();
  });

  it("returns paid without touching the mint when the order is already paid", async () => {
    getMcpOrderMock.mockResolvedValue(makeOrder({ payment_status: "paid" }));

    const res = await verify();

    expect(res.jsonBody).toMatchObject({ status: "paid" });
    expect(checkMintQuoteMock).not.toHaveBeenCalled();
  });

  it("reports unpaid while the invoice is open, and mints nothing", async () => {
    checkMintQuoteMock.mockResolvedValue({ state: "UNPAID" });

    const res = await verify();

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({ status: "unpaid" });
    expect(claimMcpLightningMintMock).not.toHaveBeenCalled();
    expect(mintPaidQuoteMock).not.toHaveBeenCalled();
  });

  it("mints the paid invoice, saves the token, pays the seller, then marks the order paid", async () => {
    const res = await verify();

    expect(mintPaidQuoteMock).toHaveBeenCalledWith(MINT, "quote-1", 1000);
    expect(setMcpLightningTokenMock).toHaveBeenNthCalledWith(
      1,
      "mcp_1",
      "cashuBminted"
    );
    expect(sendOrderPaymentDmMock).toHaveBeenCalledWith({
      orderId: "mcp_1",
      buyerPubkey: BUYER,
      sellerPubkey: SELLER,
      productAddress: `30402:${SELLER}:listing-1`,
      productTitle: "Honey",
      quantity: 2,
      amount: 1000,
      token: "cashuBminted",
      selectedSpecs: { size: "L" },
      shippingAddress: { name: "Ann" },
      encryptedNsec: "enc",
    });
    expect(updateMcpOrderPaymentMock).toHaveBeenCalledWith(
      "mcp_1",
      "ln_quote-1",
      "paid"
    );
    expect(setMcpLightningTokenMock).toHaveBeenLastCalledWith("mcp_1", null);
    expect(setMcpLightningTokenMock.mock.invocationCallOrder[0]).toBeLessThan(
      sendOrderPaymentDmMock.mock.invocationCallOrder[0]!
    );
    expect(sendOrderPaymentDmMock.mock.invocationCallOrder[0]).toBeLessThan(
      updateMcpOrderPaymentMock.mock.invocationCallOrder[0]!
    );
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({ success: true, status: "paid" });
  });

  it("does not mint twice when another request holds the claim", async () => {
    claimMcpLightningMintMock.mockResolvedValue(false);

    const res = await verify();

    expect(res.jsonBody).toMatchObject({ status: "processing" });
    expect(mintPaidQuoteMock).not.toHaveBeenCalled();
    expect(sendOrderPaymentDmMock).not.toHaveBeenCalled();
  });

  it("lets the next request retry when the mint did nothing", async () => {
    mintPaidQuoteMock.mockRejectedValue(new Error("mint down"));

    const res = await verify();

    expect(res.statusCode).toBe(500);
    expect(releaseMcpLightningClaimMock).toHaveBeenCalledWith("mcp_1");
    expect(sendOrderPaymentDmMock).not.toHaveBeenCalled();
  });

  it("keeps the claim when the mint may have gone through", async () => {
    mintPaidQuoteMock.mockRejectedValue(new Error("response lost"));
    checkMintQuoteMock
      .mockResolvedValueOnce({ state: "PAID" })
      .mockResolvedValueOnce({ state: "ISSUED" });

    const res = await verify();

    expect(res.statusCode).toBe(500);
    expect(releaseMcpLightningClaimMock).not.toHaveBeenCalled();
  });

  it("still delivers the token when saving it fails", async () => {
    setMcpLightningTokenMock.mockRejectedValueOnce(new Error("db down"));

    const res = await verify();

    expect(sendOrderPaymentDmMock).toHaveBeenCalledWith(
      expect.objectContaining({ token: "cashuBminted" })
    );
    expect(res.jsonBody).toMatchObject({ status: "paid" });
  });

  it("keeps the order unpaid and the token saved when the seller cannot be reached", async () => {
    sendOrderPaymentDmMock.mockRejectedValue(new Error("cache down"));

    const res = await verify();

    expect(res.statusCode).toBe(502);
    expect(updateMcpOrderPaymentMock).not.toHaveBeenCalled();
    expect(setMcpLightningTokenMock).not.toHaveBeenCalledWith("mcp_1", null);
  });

  it("retries only the delivery when a saved token is waiting", async () => {
    getMcpLightningPaymentMock.mockResolvedValue(
      makePayment({ seller_token: "cashuBsaved", claim_age_seconds: 30 })
    );

    const res = await verify();

    expect(checkMintQuoteMock).not.toHaveBeenCalled();
    expect(mintPaidQuoteMock).not.toHaveBeenCalled();
    expect(sendOrderPaymentDmMock).toHaveBeenCalledWith(
      expect.objectContaining({ token: "cashuBsaved" })
    );
    expect(res.jsonBody).toMatchObject({ status: "paid" });
  });

  describe("invoice already minted", () => {
    beforeEach(() => {
      checkMintQuoteMock.mockResolvedValue({ state: "ISSUED" });
    });

    it("fails the order when someone else minted it", async () => {
      const res = await verify();

      expect(res.statusCode).toBe(409);
      expect(updateMcpOrderPaymentMock).toHaveBeenCalledWith(
        "mcp_1",
        "failed_mcp_1",
        "failed"
      );
      expect(sendOrderPaymentDmMock).not.toHaveBeenCalled();
    });

    it("reports processing while our own mint is recent", async () => {
      getMcpLightningPaymentMock.mockResolvedValue(
        makePayment({ claim_age_seconds: 5 })
      );

      const res = await verify();

      expect(res.jsonBody).toMatchObject({ status: "processing" });
      expect(updateMcpOrderPaymentMock).not.toHaveBeenCalled();
    });

    it("fails the order when our own mint never finished", async () => {
      getMcpLightningPaymentMock.mockResolvedValue(
        makePayment({ claim_age_seconds: 600 })
      );

      const res = await verify();

      expect(res.statusCode).toBe(500);
      expect(updateMcpOrderPaymentMock).toHaveBeenCalledWith(
        "mcp_1",
        "failed_mcp_1",
        "failed"
      );
    });
  });

  it("refuses to verify someone else's order", async () => {
    getMcpOrderMock.mockResolvedValue(
      makeOrder({ buyer_pubkey: "d".repeat(64) })
    );

    const res = await verify();

    expect(res.statusCode).toBe(403);
    expect(checkMintQuoteMock).not.toHaveBeenCalled();
  });
});
