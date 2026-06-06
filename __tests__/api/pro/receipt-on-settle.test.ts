const applyRateLimitMock = jest.fn();
const requireAdminMock = jest.fn();
const getProManualInvoiceMock = jest.fn();
const settleProManualInvoiceAtomicMock = jest.fn();
const getMembershipViewMock = jest.fn();
const sendProManualReceiptEmailMock = jest.fn();
const verifySignedHttpRequestProofMock = jest.fn();
const extractSignedEventFromRequestMock = jest.fn();
const buildProVerifyInvoiceProofMock = jest.fn();
const verifyBitcoinInvoicePaidMock = jest.fn();

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimitMock(...args),
}));

jest.mock("@/utils/admin/auth", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));

jest.mock("@/utils/db/pro-membership", () => ({
  getProManualInvoice: (...args: unknown[]) => getProManualInvoiceMock(...args),
  settleProManualInvoiceAtomic: (...args: unknown[]) =>
    settleProManualInvoiceAtomicMock(...args),
}));

jest.mock("@/utils/pro/membership", () => ({
  getMembershipView: (...args: unknown[]) => getMembershipViewMock(...args),
  sendProManualReceiptEmail: (...args: unknown[]) =>
    sendProManualReceiptEmailMock(...args),
}));

jest.mock("@/utils/nostr/request-auth", () => ({
  verifySignedHttpRequestProof: (...args: unknown[]) =>
    verifySignedHttpRequestProofMock(...args),
  extractSignedEventFromRequest: (...args: unknown[]) =>
    extractSignedEventFromRequestMock(...args),
  buildProVerifyInvoiceProof: (...args: unknown[]) =>
    buildProVerifyInvoiceProofMock(...args),
}));

jest.mock("@/utils/pro/lightning-pro", () => ({
  verifyBitcoinInvoicePaid: (...args: unknown[]) =>
    verifyBitcoinInvoicePaidMock(...args),
}));

import confirmHandler from "@/pages/api/pro/confirm-invoice";
import verifyHandler from "@/pages/api/pro/verify-invoice";

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

const settledInvoice = {
  id: 1,
  invoice_id: "inv-1",
  pubkey: "seller-pubkey",
  amount_usd_cents: 1500,
  term: "monthly",
  method: "bitcoin",
  paid_at: "2026-05-30T12:00:00.000Z",
  created_at: "2026-05-30T11:00:00.000Z",
};

describe("/api/pro/confirm-invoice receipt-on-settle", () => {
  beforeEach(() => {
    applyRateLimitMock.mockReset().mockReturnValue(true);
    requireAdminMock.mockReset().mockReturnValue({ pubkey: "admin" });
    getProManualInvoiceMock.mockReset();
    settleProManualInvoiceAtomicMock.mockReset();
    getMembershipViewMock.mockReset().mockResolvedValue({ status: "active" });
    sendProManualReceiptEmailMock.mockReset().mockResolvedValue(undefined);
  });

  it("sends the receipt on a fresh settle", async () => {
    getProManualInvoiceMock.mockResolvedValue({ pubkey: "seller-pubkey" });
    settleProManualInvoiceAtomicMock.mockResolvedValue({
      outcome: "settled",
      invoice: settledInvoice,
    });

    const req = { method: "POST", body: { invoiceId: "inv-1" } } as any;
    const res = createResponse();
    await confirmHandler(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(sendProManualReceiptEmailMock).toHaveBeenCalledTimes(1);
    expect(sendProManualReceiptEmailMock).toHaveBeenCalledWith(settledInvoice);
  });

  it("does NOT send the receipt when already settled", async () => {
    getProManualInvoiceMock.mockResolvedValue({ pubkey: "seller-pubkey" });
    settleProManualInvoiceAtomicMock.mockResolvedValue({
      outcome: "already_settled",
      invoice: settledInvoice,
    });

    const req = { method: "POST", body: { invoiceId: "inv-1" } } as any;
    const res = createResponse();
    await confirmHandler(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(sendProManualReceiptEmailMock).not.toHaveBeenCalled();
  });
});

describe("/api/pro/verify-invoice receipt-on-settle", () => {
  beforeEach(() => {
    applyRateLimitMock.mockReset().mockReturnValue(true);
    getProManualInvoiceMock.mockReset();
    settleProManualInvoiceAtomicMock.mockReset();
    getMembershipViewMock.mockReset().mockResolvedValue({ status: "active" });
    sendProManualReceiptEmailMock.mockReset().mockResolvedValue(undefined);
    verifySignedHttpRequestProofMock.mockReset().mockReturnValue({ ok: true });
    extractSignedEventFromRequestMock.mockReset().mockReturnValue({});
    buildProVerifyInvoiceProofMock.mockReset().mockReturnValue({});
    verifyBitcoinInvoicePaidMock.mockReset().mockResolvedValue(true);
  });

  it("sends the receipt on a fresh settle", async () => {
    getProManualInvoiceMock.mockResolvedValue({
      pubkey: "seller-pubkey",
      method: "bitcoin",
      membership_applied_at: null,
      bolt11: "lnbc...",
      verify_url: "https://verify.test",
    });
    settleProManualInvoiceAtomicMock.mockResolvedValue({
      outcome: "settled",
      invoice: settledInvoice,
    });

    const req = {
      method: "POST",
      body: { pubkey: "seller-pubkey", invoiceId: "inv-1" },
    } as any;
    const res = createResponse();
    await verifyHandler(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(sendProManualReceiptEmailMock).toHaveBeenCalledTimes(1);
    expect(sendProManualReceiptEmailMock).toHaveBeenCalledWith(settledInvoice);
  });

  it("does NOT send the receipt when already settled", async () => {
    getProManualInvoiceMock.mockResolvedValue({
      pubkey: "seller-pubkey",
      method: "bitcoin",
      membership_applied_at: null,
      bolt11: "lnbc...",
      verify_url: "https://verify.test",
    });
    settleProManualInvoiceAtomicMock.mockResolvedValue({
      outcome: "already_settled",
      invoice: settledInvoice,
    });

    const req = {
      method: "POST",
      body: { pubkey: "seller-pubkey", invoiceId: "inv-1" },
    } as any;
    const res = createResponse();
    await verifyHandler(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(sendProManualReceiptEmailMock).not.toHaveBeenCalled();
  });

  it("does NOT send the receipt when the invoice was already fully applied", async () => {
    getProManualInvoiceMock.mockResolvedValue({
      pubkey: "seller-pubkey",
      method: "bitcoin",
      membership_applied_at: "2026-05-30T12:00:00.000Z",
    });

    const req = {
      method: "POST",
      body: { pubkey: "seller-pubkey", invoiceId: "inv-1" },
    } as any;
    const res = createResponse();
    await verifyHandler(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(settleProManualInvoiceAtomicMock).not.toHaveBeenCalled();
    expect(sendProManualReceiptEmailMock).not.toHaveBeenCalled();
  });
});
