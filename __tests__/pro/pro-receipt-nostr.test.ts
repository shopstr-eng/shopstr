const getSellerNotificationEmailMock = jest.fn();
const sendProReceiptMock = jest.fn();
const sendServerSideNostrDMMock = jest.fn();
const getProMembershipBySubscriptionMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  getSellerNotificationEmail: (...args: unknown[]) =>
    getSellerNotificationEmailMock(...args),
}));

jest.mock("@/utils/email/email-service", () => ({
  sendProReceipt: (...args: unknown[]) => sendProReceiptMock(...args),
}));

jest.mock("@/utils/nostr/server-nostr-helpers", () => ({
  sendServerSideNostrDM: (...args: unknown[]) =>
    sendServerSideNostrDMMock(...args),
}));

jest.mock("@/utils/db/pro-membership", () => ({
  getProMembershipBySubscription: (...args: unknown[]) =>
    getProMembershipBySubscriptionMock(...args),
}));

jest.mock("@/utils/pro/stripe-pro", () => ({
  listProStripeInvoices: jest.fn(),
  mapStripeSubscription: jest.fn(),
}));

import {
  sendProManualReceiptEmail,
  sendProStripeReceiptEmail,
} from "@/utils/pro/membership";

const manualInvoice = {
  id: 1,
  invoice_id: "inv-1",
  pubkey: "seller-pubkey",
  term: "monthly",
  method: "bitcoin",
  amount_usd_cents: 1500,
  paid_at: "2026-05-30T12:00:00.000Z",
  created_at: "2026-05-30T11:00:00.000Z",
} as any;

function stripeInvoice() {
  return {
    amount_paid: 1500,
    currency: "usd",
    subscription: "sub_123",
    hosted_invoice_url: "https://stripe.test/receipt",
    invoice_pdf: "https://stripe.test/receipt.pdf",
    created: 1748606400,
    status_transitions: { paid_at: 1748606400 },
    lines: { data: [{ price: { recurring: { interval: "month" } } }] },
  } as any;
}

describe("Pro receipts reach Nostr-only sellers", () => {
  beforeEach(() => {
    getSellerNotificationEmailMock.mockReset();
    sendProReceiptMock.mockReset().mockResolvedValue(undefined);
    sendServerSideNostrDMMock.mockReset().mockResolvedValue(undefined);
    getProMembershipBySubscriptionMock.mockReset();
  });

  it("manual: DMs the seller over Nostr when no email is on file, skipping email", async () => {
    getSellerNotificationEmailMock.mockResolvedValue(null);

    await sendProManualReceiptEmail(manualInvoice);

    expect(sendProReceiptMock).not.toHaveBeenCalled();
    expect(sendServerSideNostrDMMock).toHaveBeenCalledTimes(1);
    expect(sendServerSideNostrDMMock.mock.calls[0][0]).toBe("seller-pubkey");
  });

  it("manual: sends BOTH email and Nostr DM when an email is on file", async () => {
    getSellerNotificationEmailMock.mockResolvedValue("seller@example.com");

    await sendProManualReceiptEmail(manualInvoice);

    expect(sendProReceiptMock).toHaveBeenCalledTimes(1);
    expect(sendProReceiptMock.mock.calls[0][0]).toBe("seller@example.com");
    expect(sendServerSideNostrDMMock).toHaveBeenCalledTimes(1);
  });

  it("manual: still DMs over Nostr even if the email send throws", async () => {
    getSellerNotificationEmailMock.mockResolvedValue("seller@example.com");
    sendProReceiptMock.mockRejectedValue(new Error("smtp down"));

    await sendProManualReceiptEmail(manualInvoice);

    expect(sendServerSideNostrDMMock).toHaveBeenCalledTimes(1);
  });

  it("stripe: DMs the seller over Nostr when no email is on file, skipping email", async () => {
    getProMembershipBySubscriptionMock.mockResolvedValue({
      pubkey: "seller-pubkey",
    });
    getSellerNotificationEmailMock.mockResolvedValue(null);

    await sendProStripeReceiptEmail(stripeInvoice());

    expect(sendProReceiptMock).not.toHaveBeenCalled();
    expect(sendServerSideNostrDMMock).toHaveBeenCalledTimes(1);
    expect(sendServerSideNostrDMMock.mock.calls[0][0]).toBe("seller-pubkey");
  });

  it("stripe: sends BOTH email and Nostr DM when an email is on file", async () => {
    getProMembershipBySubscriptionMock.mockResolvedValue({
      pubkey: "seller-pubkey",
    });
    getSellerNotificationEmailMock.mockResolvedValue("seller@example.com");

    await sendProStripeReceiptEmail(stripeInvoice());

    expect(sendProReceiptMock).toHaveBeenCalledTimes(1);
    expect(sendServerSideNostrDMMock).toHaveBeenCalledTimes(1);
  });
});
