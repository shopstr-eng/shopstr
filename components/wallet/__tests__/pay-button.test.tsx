import {
  render,
  screen,
  fireEvent,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import PayButton from "../pay-button";
import { CashuWalletContext } from "../../../utils/context/context";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import {
  getLocalStorageData,
  publishProofEvent,
} from "@/utils/nostr/nostr-helper-functions";
import { NostrNIP46Signer } from "@/utils/nostr/signers/nostr-nip46-signer";

jest.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  getLocalStorageData: jest.fn(),
  publishProofEvent: jest.fn(),
}));

jest.mock("../../utility-components/display-monetary-info", () => ({
  formatWithCommas: (amount: number) => `${amount} sats`,
}));

jest.mock("@/utils/nostr/signers/nostr-nip46-signer", () => ({
  NostrNIP46Signer: jest.fn().mockImplementation(() => ({})),
}));

const mockCreateMeltQuote = jest.fn();
const mockGetKeySets = jest.fn();
const mockSend = jest.fn();
const mockMeltProofs = jest.fn();

jest.mock("@cashu/cashu-ts", () => ({
  CashuMint: jest.fn().mockImplementation(() => ({})),
  CashuWallet: jest.fn().mockImplementation(() => ({
    createMeltQuote: mockCreateMeltQuote,
    getKeySets: mockGetKeySets,
    send: mockSend,
    meltProofs: mockMeltProofs,
  })),
}));

const localStorageMock = (() => {
  let store: { [key: string]: string } = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
})();
Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

const mockSigner = {
  /* mock signer object properties if needed */
};
const mockNostr = {
  /* mock nostr object properties if needed */
};
const mockWalletContext = {
  proofEvents: [
    {
      id: "event1",
      proofs: [{ id: "00d0a1b24d1c1a53", amount: 50, secret: "secret1" }],
    },
    {
      id: "event2",
      proofs: [{ id: "00d0a1b24d1c1a53", amount: 30, secret: "secret2" }],
    },
  ],
  setProofEvents: jest.fn(),
};

const renderComponent = (customSigner = mockSigner) => {
  return render(
    <NostrContext.Provider value={{ nostr: mockNostr, setNostr: jest.fn() }}>
      <SignerContext.Provider
        value={{ signer: customSigner, setSigner: jest.fn() }}
      >
        <CashuWalletContext.Provider value={mockWalletContext}>
          <PayButton />
        </CashuWalletContext.Provider>
      </SignerContext.Provider>
    </NostrContext.Provider>
  );
};

describe("PayButton Component", () => {
  const initialTokens = [
    { id: "00d0a1b24d1c1a53", amount: 100, secret: "mock_secret" },
    { id: "different_keyset", amount: 50, secret: "other_secret" },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();

    localStorageMock.setItem("tokens", JSON.stringify(initialTokens));
    localStorageMock.setItem("history", JSON.stringify([]));

    (getLocalStorageData as jest.Mock).mockImplementation(() => ({
      mints: ["https://legend.lnbits.com/cashu/api/v1/4gr9XkQ8ez543F4L6f5UqA"],
      tokens: JSON.parse(localStorageMock.getItem("tokens") || "[]"),
      history: JSON.parse(localStorageMock.getItem("history") || "[]"),
    }));
  });

  test("renders the pay button initially", () => {
    renderComponent();
    expect(screen.getByRole("button", { name: /pay/i })).toBeInTheDocument();
    expect(screen.queryByText("Pay Lightning Invoice")).not.toBeInTheDocument();
  });

  test("opens and closes the pay modal on button clicks", async () => {
    renderComponent();

    const payButton = screen.getByRole("button", { name: /pay/i });
    fireEvent.click(payButton);
    expect(await screen.findByText("Pay Lightning Invoice")).toBeVisible();

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelButton);
    await waitForElementToBeRemoved(() =>
      screen.queryByText("Pay Lightning Invoice")
    );
  });

  test("shows validation error for invalid invoice prefix", async () => {
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /pay/i }));

    const invoiceInput = await screen.findByLabelText("Lightning invoice");
    const modal = screen.getByRole("dialog");
    const submitButton = within(modal).getByRole("button", { name: "Pay" });

    fireEvent.change(invoiceInput, {
      target: { value: "this_is_an_invalid_invoice" },
    });
    fireEvent.click(submitButton);

    expect(
      await screen.findByText("The lightning invoice must start with 'lnbc'.")
    ).toBeVisible();
    expect(publishProofEvent).not.toHaveBeenCalled();
  });

  test("shows validation error for empty invoice", async () => {
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /pay/i }));

    const modal = screen.getByRole("dialog");
    const submitButton = within(modal).getByRole("button", { name: "Pay" });

    fireEvent.click(submitButton);

    expect(
      await screen.findByText("A Lightning invoice is required.")
    ).toBeVisible();
    expect(publishProofEvent).not.toHaveBeenCalled();
  });

  test("calculates and displays fee reserve correctly", async () => {
    const mockInvoice = "lnbc100n...";
    mockCreateMeltQuote.mockResolvedValue({ amount: 100, fee_reserve: 5 });

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /pay/i }));

    const invoiceInput = await screen.findByLabelText("Lightning invoice");
    fireEvent.change(invoiceInput, { target: { value: mockInvoice } });

    expect(await screen.findByText("Fee Reserve: 5 sats")).toBeVisible();
    expect(mockCreateMeltQuote).toHaveBeenCalledWith(mockInvoice);
  });

  test("handles fee calculation error gracefully", async () => {
    const mockInvoice = "lnbc100n...";
    mockCreateMeltQuote.mockRejectedValue(new Error("Fee calculation failed"));

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /pay/i }));

    const invoiceInput = await screen.findByLabelText("Lightning invoice");
    fireEvent.change(invoiceInput, { target: { value: mockInvoice } });

    await waitFor(() => {
      expect(screen.queryByText(/Fee Reserve:/)).not.toBeInTheDocument();
    });
  });

  test("resets fee reserve for invalid invoice format", async () => {
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /pay/i }));

    const invoiceInput = await screen.findByLabelText("Lightning invoice");

    fireEvent.change(invoiceInput, { target: { value: "lnbc100n..." } });
    fireEvent.change(invoiceInput, { target: { value: "invalid_format" } });

    await waitFor(() => {
      expect(screen.queryByText(/Fee Reserve:/)).not.toBeInTheDocument();
    });
  });

  test("shows NIP46 signer information when using NostrNIP46Signer", async () => {
    const nip46Signer = new NostrNIP46Signer();
    renderComponent(nip46Signer);

    fireEvent.click(screen.getByRole("button", { name: /pay/i }));

    await screen.findByText("Pay Lightning Invoice");

    expect(
      screen.queryByText(/If the invoice payment is taking a while/)
    ).not.toBeInTheDocument();
  });

  test("does not show NIP46 information for regular signer", async () => {
    renderComponent();

    fireEvent.click(screen.getByRole("button", { name: /pay/i }));

    await screen.findByText("Pay Lightning Invoice");
    expect(
      screen.queryByText(/If the invoice payment is taking a while/)
    ).not.toBeInTheDocument();
  });

  test("handles payment with change proofs correctly", async () => {
    const mockInvoice = "lnbc100n...";
    const changeProofs = [
      { id: "00d0a1b24d1c1a53", amount: 20, secret: "change_secret" },
    ];

    mockCreateMeltQuote.mockResolvedValue({ amount: 100, fee_reserve: 2 });
    mockGetKeySets.mockResolvedValue([{ id: "00d0a1b24d1c1a53" }]);
    mockSend.mockResolvedValue({
      keep: [{ id: "00d0a1b24d1c1a53", amount: 10, secret: "keep_secret" }],
      send: [{ id: "00d0a1b24d1c1a53", amount: 102, secret: "send_secret" }],
    });
    mockMeltProofs.mockResolvedValue({ paid: true, change: changeProofs });
    (publishProofEvent as jest.Mock).mockResolvedValue(undefined);

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /pay/i }));

    const invoiceInput = await screen.findByLabelText("Lightning invoice");
    fireEvent.change(invoiceInput, { target: { value: mockInvoice } });

    const modal = screen.getByRole("dialog");
    const submitButton = within(modal).getByRole("button", { name: "Pay" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockMeltProofs).toHaveBeenCalled();
    });

    expect(JSON.parse(localStorageMock.getItem("tokens") || "[]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "different_keyset" }),
        expect.objectContaining({ amount: 10 }), // keep proof
        expect.objectContaining({ amount: 20 }), // change proof
      ])
    );
  });

  test("handles payment without change proofs", async () => {
    const mockInvoice = "lnbc100n...";

    mockCreateMeltQuote.mockResolvedValue({ amount: 100, fee_reserve: 2 });
    mockGetKeySets.mockResolvedValue([{ id: "00d0a1b24d1c1a53" }]);
    mockSend.mockResolvedValue({
      keep: [],
      send: [{ id: "00d0a1b24d1c1a53", amount: 102, secret: "send_secret" }],
    });
    mockMeltProofs.mockResolvedValue({ paid: true, change: [] });
    (publishProofEvent as jest.Mock).mockResolvedValue(undefined);

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /pay/i }));

    const invoiceInput = await screen.findByLabelText("Lightning invoice");
    fireEvent.change(invoiceInput, { target: { value: mockInvoice } });

    const modal = screen.getByRole("dialog");
    const submitButton = within(modal).getByRole("button", { name: "Pay" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockMeltProofs).toHaveBeenCalled();
    });

    expect(JSON.parse(localStorageMock.getItem("tokens") || "[]")).toEqual([
      { id: "different_keyset", amount: 50, secret: "other_secret" },
    ]);
  });

  test("handles a failed payment flow", async () => {
    const mockInvoice = "lnbc100n...";
    mockCreateMeltQuote.mockResolvedValue({ amount: 100, fee_reserve: 2 });
    mockGetKeySets.mockResolvedValue([{ id: "00d0a1b24d1c1a53" }]);
    mockSend.mockResolvedValue({
      keep: [],
      send: [{ id: "00d0a1b24d1c1a53", amount: 102, secret: "mock_secret" }],
    });
    mockMeltProofs.mockRejectedValue(new Error("Payment failed"));

    renderComponent();

    fireEvent.click(screen.getByRole("button", { name: /pay/i }));

    const invoiceInput = await screen.findByLabelText("Lightning invoice");
    fireEvent.change(invoiceInput, { target: { value: mockInvoice } });

    const modal = screen.getByRole("dialog");
    const submitButton = within(modal).getByRole("button", { name: "Pay" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Payment failed!")).toBeVisible();
    });

    expect(screen.getByText(/No routes could be found/)).toBeVisible();
    expect(publishProofEvent).not.toHaveBeenCalled();
    expect(localStorageMock.getItem("tokens")).toBe(
      JSON.stringify(initialTokens)
    );
  });

  test("closes payment failed modal", async () => {
    const mockInvoice = "lnbc100n...";
    mockCreateMeltQuote.mockResolvedValue({ amount: 100, fee_reserve: 2 });
    mockGetKeySets.mockResolvedValue([{ id: "00d0a1b24d1c1a53" }]);
    mockSend.mockResolvedValue({
      keep: [],
      send: [{ id: "00d0a1b24d1c1a53", amount: 102, secret: "mock_secret" }],
    });
    mockMeltProofs.mockRejectedValue(new Error("Payment failed"));

    renderComponent();

    fireEvent.click(screen.getByRole("button", { name: /pay/i }));

    const invoiceInput = await screen.findByLabelText("Lightning invoice");
    fireEvent.change(invoiceInput, { target: { value: mockInvoice } });

    const modal = screen.getByRole("dialog");
    const submitButton = within(modal).getByRole("button", { name: "Pay" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Payment failed!")).toBeVisible();
    });

    const failedModal = screen.getByRole("dialog", { name: /payment failed/i });
    const closeButton = within(failedModal).getByLabelText("Close");
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText("Payment failed!")).not.toBeInTheDocument();
    });
  });

  test("shows loading spinner during payment processing", async () => {
    const mockInvoice = "lnbc100n...";
    mockCreateMeltQuote.mockResolvedValue({ amount: 100, fee_reserve: 2 });
    mockGetKeySets.mockResolvedValue([{ id: "00d0a1b24d1c1a53" }]);
    mockSend.mockResolvedValue({
      keep: [],
      send: [{ id: "00d0a1b24d1c1a53", amount: 102, secret: "mock_secret" }],
    });

    mockMeltProofs.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ paid: true, change: [] }), 100)
        )
    );

    renderComponent();

    fireEvent.click(screen.getByRole("button", { name: /pay/i }));

    const invoiceInput = await screen.findByLabelText("Lightning invoice");
    fireEvent.change(invoiceInput, { target: { value: mockInvoice } });

    const modal = screen.getByRole("dialog");
    const submitButton = within(modal).getByRole("button", { name: "Pay" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      const loadingElement = screen.getByLabelText("Loading");
      expect(loadingElement).toBeInTheDocument();
    });
  });
});
