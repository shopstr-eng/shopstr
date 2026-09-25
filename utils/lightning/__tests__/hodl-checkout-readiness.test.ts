jest.mock("../lnd-payment-client", () => ({
  getLndPaymentClient: () => ({
    trackPayment: jest.fn().mockResolvedValue({ status: "unknown" }),
  }),
}));
jest.mock("@getalby/lightning-tools", () => ({ LightningAddress: jest.fn() }));
jest.mock("../hodl-seller-payout", () => ({
  resolveHodlSellerAddress: jest.fn(),
}));
jest.mock("../hodl-invoice-provider-registry", () => ({
  getHodlInvoiceProvider: jest.fn(),
}));
jest.mock("@/utils/nostr/server-hodl-arbiter-decryptor", () => ({
  getServerArbiterGiftWrapDecryptor: jest.fn(),
}));
jest.mock("../hodl-storage", () => ({ getHodlStorageKey: jest.fn() }));
import { LightningAddress } from "@getalby/lightning-tools";
import { resolveHodlSellerAddress } from "../hodl-seller-payout";
import { getHodlInvoiceProvider } from "../hodl-invoice-provider-registry";
import { getServerArbiterGiftWrapDecryptor } from "@/utils/nostr/server-hodl-arbiter-decryptor";
import { assertHodlCheckoutReady } from "../hodl-checkout-readiness";
const node = jest.fn(),
  fetchAddress = jest.fn();
const prior = process.env.LND_PAYMENT_MACAROON_HEX;
afterAll(() => {
  if (prior === undefined) delete process.env.LND_PAYMENT_MACAROON_HEX;
  else process.env.LND_PAYMENT_MACAROON_HEX = prior;
});
beforeEach(() => {
  jest.resetAllMocks();
  process.env.LND_PAYMENT_MACAROON_HEX = "ab";
  (getHodlInvoiceProvider as jest.Mock).mockReturnValue({ getNodeInfo: node });
  node.mockResolvedValue({ synced: true, blockHeight: 100 });
  (resolveHodlSellerAddress as jest.Mock).mockResolvedValue(
    "seller@example.com"
  );
  fetchAddress.mockResolvedValue(undefined);
  (LightningAddress as jest.Mock).mockImplementation(() => ({
    fetch: fetchAddress,
    lnurlpData: { rawData: { minSendable: 1000, maxSendable: 2000000 } },
  }));
});
it("checks matching arbiter, synced node and seller amount support without requesting an invoice", async () => {
  await assertHodlCheckoutReady("seller", "arbiter", 1000);
  expect(getServerArbiterGiftWrapDecryptor).toHaveBeenCalledWith("arbiter");
  expect(fetchAddress).toHaveBeenCalledTimes(1);
});
it("fails closed before payment on an unsynced node", async () => {
  node.mockResolvedValue({ synced: false, blockHeight: 100 });
  await expect(assertHodlCheckoutReady("s", "a", 1000)).rejects.toThrow();
  expect(fetchAddress).not.toHaveBeenCalled();
});
it("rejects a missing payout identity", async () => {
  (resolveHodlSellerAddress as jest.Mock).mockResolvedValue(null);
  await expect(assertHodlCheckoutReady("s", "a", 1000)).rejects.toThrow();
});
it("rejects an amount outside the receiving address range", async () => {
  await expect(assertHodlCheckoutReady("s", "a", 3000)).rejects.toThrow();
});
it("does not hide a mismatched arbiter key", async () => {
  (getServerArbiterGiftWrapDecryptor as jest.Mock).mockImplementation(() => {
    throw new Error("mismatch");
  });
  await expect(assertHodlCheckoutReady("s", "a", 1000)).rejects.toThrow(
    "mismatch"
  );
  expect(node).not.toHaveBeenCalled();
});
