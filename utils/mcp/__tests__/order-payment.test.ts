/**
 * @jest-environment node
 */

const loadMintMock = jest.fn();
const decodeTokenMock = jest.fn();
const getEncodedTokenMock = jest.fn();
const safeSwapMock = jest.fn();
const sendServerGiftWrappedDmMock = jest.fn();
const decryptNsecMock = jest.fn();

jest.mock("@cashu/cashu-ts", () => ({
  Mint: jest.fn().mockImplementation(() => ({})),
  Wallet: jest.fn().mockImplementation(() => ({
    loadMint: (...args: unknown[]) => loadMintMock(...args),
    decodeToken: (...args: unknown[]) => decodeTokenMock(...args),
  })),
  getEncodedToken: (...args: unknown[]) => getEncodedTokenMock(...args),
}));

jest.mock("@/utils/cashu/swap-retry-service", () => ({
  safeSwap: (...args: unknown[]) => safeSwapMock(...args),
}));

jest.mock("@/utils/mcp/nostr-signing", () => ({
  decryptNsec: (...args: unknown[]) => decryptNsecMock(...args),
}));

jest.mock("@/utils/nostr/server-gift-wrap", () => ({
  sendServerGiftWrappedDm: (...args: unknown[]) =>
    sendServerGiftWrappedDmMock(...args),
}));

import {
  OrderPaymentError,
  sendOrderPaymentDm,
  swapCashuPayment,
} from "../order-payment";

const MINT = "https://mint.example.com";
const BUYER = "b".repeat(64);
const SELLER = "c".repeat(64);

const proof = (amount: number, secret: string) => ({
  id: "00abc",
  amount,
  secret,
  C: "02" + "d".repeat(64),
});

describe("swapCashuPayment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadMintMock.mockResolvedValue(undefined);
    decodeTokenMock.mockReturnValue({ proofs: [proof(2, "in")] });
    getEncodedTokenMock.mockImplementation(
      ({ proofs }: { proofs: Array<{ secret: string }> }) =>
        `token:${proofs.map((p) => p.secret).join("+")}`
    );
  });

  it("swaps the buyer's proofs into a seller token and a change token", async () => {
    safeSwapMock.mockResolvedValue({
      status: "swapped",
      send: [proof(1, "s")],
      keep: [proof(1, "k")],
    });

    const result = await swapCashuPayment("cashuBin", MINT, 1);

    expect(safeSwapMock).toHaveBeenCalledWith(
      expect.anything(),
      1,
      [proof(2, "in")],
      { sendConfig: { includeFees: true } }
    );
    expect(result).toEqual({
      sellerToken: "token:s",
      changeToken: "token:k",
      changeAmount: 1,
      refundToken: "token:s+k",
      refundAmount: 2,
    });
  });

  it("returns no change token when nothing was kept", async () => {
    safeSwapMock.mockResolvedValue({
      status: "swapped",
      send: [proof(2, "s")],
      keep: [],
    });

    const result = await swapCashuPayment("cashuBin", MINT, 2);

    expect(result.changeToken).toBeNull();
    expect(result.changeAmount).toBe(0);
  });

  it("reports a 400 when the mint refuses the swap", async () => {
    safeSwapMock.mockResolvedValue({ status: "unswapped", send: [], keep: [] });

    await expect(swapCashuPayment("cashuBin", MINT, 1)).rejects.toMatchObject({
      name: "OrderPaymentError",
      status: 400,
    });
  });

  it("reports a 502 and warns against retrying when the swap outcome is unknown", async () => {
    safeSwapMock.mockResolvedValue({ status: "unknown", send: [], keep: [] });

    const error = await swapCashuPayment("cashuBin", MINT, 1).catch((e) => e);

    expect(error).toBeInstanceOf(OrderPaymentError);
    expect(error.status).toBe(502);
    expect(error.message).toMatch(/do not retry/);
  });
});

describe("sendOrderPaymentDm", () => {
  const baseParams = {
    orderId: "mcp_1",
    buyerPubkey: BUYER,
    sellerPubkey: SELLER,
    productAddress: `30402:${SELLER}:listing-1`,
    productTitle: "Honey",
    quantity: 2,
    amount: 1000,
    token: "cashuBseller",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sendServerGiftWrappedDmMock.mockResolvedValue(undefined);
  });

  it("sends the order-payment tags the orders dashboard reads", async () => {
    await sendOrderPaymentDm(baseParams);

    const call = sendServerGiftWrappedDmMock.mock.calls[0]![0];
    expect(call.recipientPubkey).toBe(SELLER);
    expect(call.tags).toEqual([
      ["subject", "order-payment"],
      ["order", "mcp_1"],
      ["b", BUYER],
      ["type", "2"],
      ["amount", "1000"],
      ["payment", "ecash", "cashuBseller"],
      ["item", `30402:${SELLER}:listing-1`, "2"],
    ]);
    expect(call.content).toContain("cashuBseller");
    expect(call.content).toContain("Honey");
  });

  it("adds the shipping address and chosen options", async () => {
    await sendOrderPaymentDm({
      ...baseParams,
      selectedSpecs: {
        size: "L",
        volume: "1 L",
        weight: "1 lb",
        bulk: { units: 6 },
      },
      shippingAddress: {
        name: "Ann",
        address: "1 Main St",
        unit: "4B",
        city: "Oslo",
        stateProvince: "Oslo",
        postalCode: "0150",
        country: "Norway",
      },
    });

    const { tags } = sendServerGiftWrappedDmMock.mock.calls[0]![0];
    expect(tags).toEqual(
      expect.arrayContaining([
        ["address", "Ann, 1 Main St, 4B, Oslo, Oslo, 0150, Norway"],
        ["size", "L"],
        ["volume", "1 L"],
        ["weight", "1 lb"],
        ["bulk", "6"],
      ])
    );
  });

  it("signs with the buyer's own key when one is stored", async () => {
    decryptNsecMock.mockReturnValue("nsec1buyer");

    await sendOrderPaymentDm({ ...baseParams, encryptedNsec: "enc" });

    expect(decryptNsecMock).toHaveBeenCalledWith("enc");
    expect(sendServerGiftWrappedDmMock.mock.calls[0]![0]).toMatchObject({
      senderPrivkeyHexOrNsec: "nsec1buyer",
    });
  });

  it("uses a fresh one-off key when the buyer has no stored key", async () => {
    await sendOrderPaymentDm(baseParams);
    await sendOrderPaymentDm(baseParams);

    const [first, second] = sendServerGiftWrappedDmMock.mock.calls.map(
      ([params]) => params.senderPrivkeyHexOrNsec
    );
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
    expect(decryptNsecMock).not.toHaveBeenCalled();
  });

  it("lets a delivery failure reach the caller", async () => {
    sendServerGiftWrappedDmMock.mockRejectedValue(new Error("cache down"));

    await expect(sendOrderPaymentDm(baseParams)).rejects.toThrow("cache down");
  });
});
