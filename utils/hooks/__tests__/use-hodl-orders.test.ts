import { renderHook, waitFor } from "@testing-library/react";
import { useHodlOrders } from "../use-hodl-orders";
const auth = jest.fn(async () => "Nostr test");
jest.mock("@/utils/nostr/nip98-auth", () => ({
  createNip98AuthorizationHeader: (...args: unknown[]) =>
    (auth as jest.Mock)(...args),
}));
const signer = {} as any;
beforeEach(() => {
  jest.clearAllMocks();
});
it("recovers saved orders without any checkout or relay message state", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      orders: [{ paymentHash: "saved-order" }],
      next: null,
    }),
  });
  const { result } = renderHook(() => useHodlOrders(signer, "buyer"));
  await waitFor(() =>
    expect(result.current.orders).toEqual([{ paymentHash: "saved-order" }])
  );
  expect(auth).toHaveBeenCalledWith(
    signer,
    expect.stringContaining("/api/lightning/hodl-orders"),
    "GET"
  );
});
it("never shows the old identity's fulfillment information after switching accounts", async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ orders: [{ paymentHash: "private" }], next: null }),
    })
    .mockImplementation(() => new Promise(() => {}));
  const { result, rerender } = renderHook(
    ({ user }) => useHodlOrders(signer, user),
    { initialProps: { user: "buyer" } }
  );
  await waitFor(() => expect(result.current.orders).toHaveLength(1));
  rerender({ user: "other" });
  expect(result.current.orders).toEqual([]);
});
it("loads every page and signs the cursor URL", async () => {
  const cursor = "ab".repeat(32);
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ orders: [{ paymentHash: cursor }], next: cursor }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        orders: [{ paymentHash: "ef".repeat(32) }],
        next: null,
      }),
    });
  const { result } = renderHook(() => useHodlOrders(signer, "buyer"));
  await waitFor(() => expect(result.current.orders).toHaveLength(2));
  expect(auth).toHaveBeenCalledWith(
    signer,
    expect.stringContaining(`?after=${cursor}`),
    "GET"
  );
});
