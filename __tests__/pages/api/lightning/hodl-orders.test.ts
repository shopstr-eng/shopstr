const authMock = jest.fn();
const listMock = jest.fn();
jest.mock("@/utils/nostr/nip98-auth", () => ({
  verifyNip98Request: (...args: unknown[]) => authMock(...args),
}));
jest.mock("@/utils/db/hodl-order-store", () => ({
  listHodlOrders: (...args: unknown[]) => listMock(...args),
}));
jest.mock("@/utils/rate-limit", () => ({ applyRateLimit: () => true }));
import handler from "@/pages/api/lightning/hodl-orders";
const buyer = "ab".repeat(32);
const response = () => ({
  setHeader: jest.fn(),
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});
beforeEach(() => {
  jest.clearAllMocks();
  authMock.mockResolvedValue({ ok: true, pubkey: buyer });
  listMock.mockResolvedValue([]);
});
it("uses only the authenticated identity and never a query-string identity", async () => {
  const res = response();
  await handler(
    { method: "GET", query: { pubkey: "someone-else" } } as any,
    res as any
  );
  expect(listMock).toHaveBeenCalledWith(buyer, "", false);
  expect(res.setHeader).toHaveBeenCalledWith(
    "Cache-Control",
    "private, no-store"
  );
});
it("refuses unsigned order discovery", async () => {
  authMock.mockResolvedValue({ ok: false, error: "Unauthorized" });
  const res = response();
  await handler({ method: "GET", query: {} } as any, res as any);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(listMock).not.toHaveBeenCalled();
});
it("validates pagination cursors", async () => {
  const res = response();
  await handler(
    { method: "GET", query: { after: "invalid" } } as any,
    res as any
  );
  expect(res.status).toHaveBeenCalledWith(400);
  expect(listMock).not.toHaveBeenCalled();
});
it("fails closed when encrypted storage is unavailable", async () => {
  listMock.mockRejectedValue(new Error("bad key"));
  const res = response();
  await handler({ method: "GET", query: {} } as any, res as any);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({
    error: expect.not.stringContaining("bad key"),
  });
});
