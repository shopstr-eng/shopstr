jest.mock("@/utils/nostr/nip98-auth", () => ({
  verifyNip98Request: jest.fn(),
}));
jest.mock("@/utils/rate-limit", () => ({ applyRateLimit: () => true }));
jest.mock("@/utils/db/hodl-order-store", () => ({
  getHodlOrderForActor: jest.fn(),
  updateHodlFulfillment: jest.fn(),
}));
jest.mock("@/utils/lightning/hodl-status-sync", () => ({
  syncHodlOrderStatus: jest.fn(),
}));
import handler from "@/pages/api/lightning/hodl-order";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import {
  getHodlOrderForActor,
  updateHodlFulfillment,
} from "@/utils/db/hodl-order-store";
import { syncHodlOrderStatus } from "@/utils/lightning/hodl-status-sync";
const hash = "a".repeat(64);
function response() {
  const res = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}
beforeEach(() => {
  jest.clearAllMocks();
  (verifyNip98Request as jest.Mock).mockResolvedValue({
    ok: true,
    pubkey: "buyer",
  });
  (getHodlOrderForActor as jest.Mock).mockResolvedValue({ paymentHash: hash });
});
it("does not contact LND or expose order existence to strangers", async () => {
  (getHodlOrderForActor as jest.Mock).mockResolvedValue(null);
  const res = response();
  await handler(
    { method: "GET", query: { paymentHash: hash } } as any,
    res as any
  );
  expect(res.status).toHaveBeenCalledWith(404);
  expect(syncHodlOrderStatus).not.toHaveBeenCalled();
});
it("requires signed authentication", async () => {
  (verifyNip98Request as jest.Mock).mockResolvedValue({
    ok: false,
    error: "no",
  });
  const res = response();
  await handler(
    { method: "GET", query: { paymentHash: hash } } as any,
    res as any
  );
  expect(res.status).toHaveBeenCalledWith(401);
  expect(getHodlOrderForActor).not.toHaveBeenCalled();
});
it("refreshes Lightning state before authorizing a fulfillment update", async () => {
  const res = response();
  await handler(
    {
      method: "POST",
      body: { paymentHash: hash, fulfillment: { address: "new" } },
    } as any,
    res as any
  );
  expect(syncHodlOrderStatus).toHaveBeenCalledWith(hash);
  expect(updateHodlFulfillment).toHaveBeenCalledWith(hash, "buyer", {
    address: "new",
  });
  expect(
    (syncHodlOrderStatus as jest.Mock).mock.invocationCallOrder[0]!
  ).toBeLessThan(
    (updateHodlFulfillment as jest.Mock).mock.invocationCallOrder[0]!
  );
});
it("does not let a client overwrite immutable payment fields", async () => {
  const res = response();
  await handler(
    {
      method: "POST",
      body: {
        paymentHash: hash,
        amountSats: 1,
        fulfillment: { address: "new" },
      },
    } as any,
    res as any
  );
  expect(res.status).toHaveBeenCalledWith(400);
  expect(updateHodlFulfillment).not.toHaveBeenCalled();
});
