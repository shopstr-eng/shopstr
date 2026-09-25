import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import {
  registerHodlOrder,
  startNewHodlCheckout,
  getHodlOrder,
  updateHodlOrderFulfillment,
} from "../hodl-order-client";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { createNip98AuthorizationHeader } from "@/utils/nostr/nip98-auth";
jest.mock("@/utils/nostr/nip98-auth", () => ({
  createNip98AuthorizationHeader: jest.fn().mockResolvedValue("signed"),
}));
const signer = { getPubKey: async () => "buyer" } as NostrSigner;
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
const originalEncoder = globalThis.TextEncoder;
const originalFetch = globalThis.fetch;
beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: webcrypto,
  });
  globalThis.TextEncoder = TextEncoder;
});
afterAll(() => {
  if (originalCrypto)
    Object.defineProperty(globalThis, "crypto", originalCrypto);
  globalThis.TextEncoder = originalEncoder;
  globalThis.fetch = originalFetch;
});
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      order: {},
      invoice: "invoice",
      paymentHash: "hash",
    }),
  });
});
const checkoutIds = () =>
  (fetch as jest.Mock).mock.calls.map(
    ([, init]) => JSON.parse(init.body).checkoutId
  );
it("resumes the same checkout when equivalent selections have different property order", async () => {
  await registerHodlOrder(signer, {
    productId: "item",
    amountSats: 1000,
    quantity: 2,
    fulfillment: { contact: "buyer", address: "pickup" },
  });
  await registerHodlOrder(signer, {
    fulfillment: { address: "pickup", contact: "buyer" },
    quantity: 2,
    amountSats: 1000,
    productId: "item",
  });
  expect(new Set(checkoutIds()).size).toBe(1);
});
it("only rotates the saved checkout when a new purchase is explicitly chosen", async () => {
  const params = { productId: "item", amountSats: 1000 };
  await registerHodlOrder(signer, params);
  await startNewHodlCheckout(signer, params);
  await registerHodlOrder(signer, params);
  expect(new Set(checkoutIds()).size).toBe(2);
});
it("signs the exact request body and preserves authenticated no-store reads", async () => {
  await updateHodlOrderFulfillment(signer, "hash", { address: "new pickup" });
  const [path, init] = (fetch as jest.Mock).mock.calls[0];
  expect(createNip98AuthorizationHeader).toHaveBeenLastCalledWith(
    signer,
    window.location.origin + path,
    "POST",
    init.body
  );
  await getHodlOrder(signer, "hash");
  expect(fetch).toHaveBeenLastCalledWith(
    expect.stringContaining("paymentHash=hash"),
    expect.objectContaining({
      cache: "no-store",
      headers: expect.objectContaining({ Authorization: "signed" }),
    })
  );
});
it("migrates an existing checkout ID instead of creating another invoice after an upgrade", async () => {
  const params = { productId: "item", quantity: 2, amountSats: 1000 };
  const bytes = new TextEncoder().encode(
    JSON.stringify({ productId: "item", quantity: 2 })
  );
  const digest = Buffer.from(
    await webcrypto.subtle.digest("SHA-256", bytes)
  ).toString("hex");
  localStorage.setItem(`hodl-checkout:buyer:${digest}`, "previous-checkout");
  await registerHodlOrder(signer, params);
  expect(checkoutIds()).toEqual(["previous-checkout"]);
});
