const getSellerNotificationEmailMock = jest.fn();
const getProMembershipBySubscriptionMock = jest.fn();
const sendProReceiptMock = jest.fn();
const sendServerSideNostrDMMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  getSellerNotificationEmail: (...args: unknown[]) =>
    getSellerNotificationEmailMock(...args),
}));

jest.mock("@/utils/db/pro-membership", () => ({
  getProMembershipBySubscription: (...args: unknown[]) =>
    getProMembershipBySubscriptionMock(...args),
}));

jest.mock("@/utils/email/email-service", () => ({
  sendProReceipt: (...args: unknown[]) => sendProReceiptMock(...args),
}));

jest.mock("@/utils/nostr/server-nostr-helpers", () => ({
  sendServerSideNostrDM: (...args: unknown[]) =>
    sendServerSideNostrDMMock(...args),
}));

jest.mock("@/utils/pro/stripe-pro", () => ({
  listProStripeInvoices: jest.fn(),
  mapStripeSubscription: jest.fn(),
}));

import {
  sendProManualReceiptEmail,
  sendProStripeReceiptEmail,
} from "@/utils/pro/membership";

function manualInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    invoice_id: "inv-1",
    pubkey: "seller-pubkey",
    amount_usd_cents: 1500,
    term: "monthly" as const,
    method: "bitcoin" as const,
    paid_at: "2026-05-30T12:00:00.000Z",
    created_at: "2026-05-30T11:00:00.000Z",
    ...overrides,
  } as any;
}

describe("sendProManualReceiptEmail", () => {
  beforeEach(() => {
    getSellerNotificationEmailMock.mockReset();
    sendProReceiptMock.mockReset();
    sendServerSideNostrDMMock.mockReset();
    sendProReceiptMock.mockResolvedValue(true);
    sendServerSideNostrDMMock.mockResolvedValue(undefined);
  });

  it("emails the seller's notification address and DMs over Nostr", async () => {
    getSellerNotificationEmailMock.mockResolvedValue("seller@example.com");

    await sendProManualReceiptEmail(manualInvoice());

    expect(sendProReceiptMock).toHaveBeenCalledTimes(1);
    expect(sendProReceiptMock).toHaveBeenCalledWith(
      "seller@example.com",
      expect.objectContaining({
        amountCents: 1500,
        currency: "usd",
        term: "monthly",
        method: "bitcoin",
        invoicePdfUrl: null,
      })
    );
    expect(sendServerSideNostrDMMock).toHaveBeenCalledTimes(1);
    expect(sendServerSideNostrDMMock).toHaveBeenCalledWith(
      "seller-pubkey",
      expect.any(String),
      expect.any(String)
    );
  });

  it("skips the email when the seller has no notification email but still DMs", async () => {
    getSellerNotificationEmailMock.mockResolvedValue(null);

    await sendProManualReceiptEmail(manualInvoice());

    expect(sendProReceiptMock).not.toHaveBeenCalled();
    expect(sendServerSideNostrDMMock).toHaveBeenCalledTimes(1);
  });

  it("still DMs when the email send throws (best-effort)", async () => {
    getSellerNotificationEmailMock.mockRejectedValue(new Error("smtp down"));

    await expect(
      sendProManualReceiptEmail(manualInvoice())
    ).resolves.toBeUndefined();

    expect(sendServerSideNostrDMMock).toHaveBeenCalledTimes(1);
  });
});

function stripeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    amount_paid: 9900,
    currency: "usd",
    subscription: "sub-123",
    created: 1748606400,
    status_transitions: { paid_at: 1748606400 },
    hosted_invoice_url: "https://stripe.test/receipt/xyz",
    invoice_pdf: "https://stripe.test/invoice/xyz.pdf",
    lines: {
      data: [{ price: { recurring: { interval: "year" } } }],
    },
    ...overrides,
  } as any;
}

describe("sendProStripeReceiptEmail", () => {
  beforeEach(() => {
    getSellerNotificationEmailMock.mockReset();
    getProMembershipBySubscriptionMock.mockReset();
    sendProReceiptMock.mockReset();
    sendServerSideNostrDMMock.mockReset();
    sendProReceiptMock.mockResolvedValue(true);
    sendServerSideNostrDMMock.mockResolvedValue(undefined);
  });

  it("resolves the pubkey from the subscription and sends receipt + DM", async () => {
    getProMembershipBySubscriptionMock.mockResolvedValue({
      pubkey: "stripe-seller",
    });
    getSellerNotificationEmailMock.mockResolvedValue("stripe@example.com");

    await sendProStripeReceiptEmail(stripeInvoice());

    expect(getProMembershipBySubscriptionMock).toHaveBeenCalledWith("sub-123");
    expect(sendProReceiptMock).toHaveBeenCalledWith(
      "stripe@example.com",
      expect.objectContaining({
        amountCents: 9900,
        currency: "usd",
        term: "yearly",
        method: "stripe",
        receiptUrl: "https://stripe.test/receipt/xyz",
        invoicePdfUrl: "https://stripe.test/invoice/xyz.pdf",
      })
    );
    expect(sendServerSideNostrDMMock).toHaveBeenCalledWith(
      "stripe-seller",
      expect.any(String),
      expect.any(String)
    );
  });

  it("skips $0 invoices entirely (e.g. trial invoices)", async () => {
    await sendProStripeReceiptEmail(stripeInvoice({ amount_paid: 0 }));

    expect(getProMembershipBySubscriptionMock).not.toHaveBeenCalled();
    expect(sendProReceiptMock).not.toHaveBeenCalled();
    expect(sendServerSideNostrDMMock).not.toHaveBeenCalled();
  });

  it("skips when no subscription id is present", async () => {
    await sendProStripeReceiptEmail(stripeInvoice({ subscription: null }));

    expect(getProMembershipBySubscriptionMock).not.toHaveBeenCalled();
    expect(sendProReceiptMock).not.toHaveBeenCalled();
    expect(sendServerSideNostrDMMock).not.toHaveBeenCalled();
  });

  it("skips when the subscription has no membership pubkey", async () => {
    getProMembershipBySubscriptionMock.mockResolvedValue(null);

    await sendProStripeReceiptEmail(stripeInvoice());

    expect(sendProReceiptMock).not.toHaveBeenCalled();
    expect(sendServerSideNostrDMMock).not.toHaveBeenCalled();
  });

  it("skips the email when the seller has no notification email but still DMs", async () => {
    getProMembershipBySubscriptionMock.mockResolvedValue({
      pubkey: "stripe-seller",
    });
    getSellerNotificationEmailMock.mockResolvedValue(null);

    await sendProStripeReceiptEmail(stripeInvoice());

    expect(sendProReceiptMock).not.toHaveBeenCalled();
    expect(sendServerSideNostrDMMock).toHaveBeenCalledTimes(1);
  });
});
