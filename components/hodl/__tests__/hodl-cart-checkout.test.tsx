import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import HodlCartCheckout from "../hodl-cart-checkout";
import {
  quoteHodlCheckout,
  registerHodlOrder,
  getHodlOrder,
} from "@/utils/lightning/hodl-order-client";
jest.mock("@/components/utility-components/nostr-context-provider", () => ({
  SignerContext: require("react").createContext({ signer: {} }),
}));
jest.mock("@heroui/react", () => ({
  Button: ({ children, onPress, isDisabled, isLoading }: any) => (
    <button disabled={isDisabled || isLoading} onClick={onPress}>
      {children}
    </button>
  ),
}));
jest.mock("../hodl-order-details", () => ({
  __esModule: true,
  default: ({ paymentHash }: { paymentHash: string }) => (
    <div data-testid={paymentHash}>Saved invoice</div>
  ),
}));
jest.mock("@/utils/lightning/hodl-order-client", () => ({
  quoteHodlCheckout: jest.fn(),
  registerHodlOrder: jest.fn(),
  getHodlOrder: jest.fn(),
  startNewHodlCheckout: jest.fn(),
}));
it("retries a failed cart line without creating another invoice for the saved line", async () => {
  (quoteHodlCheckout as jest.Mock).mockResolvedValue(2000);
  (getHodlOrder as jest.Mock).mockResolvedValue({ status: "open" });
  let secondAttempts = 0;
  (registerHodlOrder as jest.Mock).mockImplementation(async (_, params) => {
    if (params.productId === "second" && secondAttempts++ === 0)
      throw new Error("Seller address unavailable");
    return { paymentHash: params.productId + "-invoice", invoice: "fixture" };
  });
  render(
    <HodlCartCheckout
      items={[
        { title: "First item", params: { productId: "first", quantity: 2 } },
        { title: "Second item", params: { productId: "second", quantity: 1 } },
      ]}
      onClose={() => {}}
      onFunded={() => {}}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Review escrow prices" }));
  await screen.findByText("Escrow total: 4000 sats");
  fireEvent.click(
    screen.getByRole("button", { name: "Create / retry escrow invoices" })
  );
  await screen.findByText("Seller address unavailable");
  expect(screen.getByTestId("first-invoice")).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Create / retry escrow invoices" })
    ).not.toBeDisabled()
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Create / retry escrow invoices" })
  );
  await screen.findByTestId("second-invoice");
  const calls = (registerHodlOrder as jest.Mock).mock.calls;
  expect(calls.filter(([, p]) => p.productId === "first")).toHaveLength(1);
  expect(calls.filter(([, p]) => p.productId === "second")).toHaveLength(2);
});
it("removes a funded cart line once, so later polls do not remove a new purchase", async () => {
  jest.useFakeTimers();
  try {
    jest.clearAllMocks();
    (quoteHodlCheckout as jest.Mock).mockResolvedValue(1000);
    (registerHodlOrder as jest.Mock).mockResolvedValue({
      paymentHash: "paid-order",
      invoice: "fixture",
    });
    (getHodlOrder as jest.Mock).mockResolvedValue({ status: "accepted" });
    const onFunded = jest.fn();
    render(
      <HodlCartCheckout
        items={[{ title: "Item", params: { productId: "item" } }]}
        onClose={() => {}}
        onFunded={onFunded}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review escrow prices" })
    );
    await screen.findByText("Escrow total: 1000 sats");
    fireEvent.click(
      screen.getByRole("button", { name: "Create / retry escrow invoices" })
    );
    await waitFor(() => expect(onFunded).toHaveBeenCalledTimes(1));
    await act(async () => {
      jest.advanceTimersByTime(15000);
    });
    expect(onFunded).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});
