import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import MintButton from "../mint-button";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { CashuMint, CashuWallet } from "@cashu/cashu-ts";
import * as NostrHelper from "@/utils/nostr/nostr-helper-functions";
import QRCode from "qrcode";

jest.mock("@cashu/cashu-ts");
const mockCreateMintQuote = jest.fn();
const mockCheckMintQuote = jest.fn();
const mockMintProofs = jest.fn();
(CashuWallet as jest.Mock).mockImplementation(() => ({
  createMintQuote: mockCreateMintQuote,
  checkMintQuote: mockCheckMintQuote,
  mintProofs: mockMintProofs,
}));
(CashuMint as jest.Mock).mockImplementation(() => ({}));

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  getLocalStorageData: jest.fn(),
  publishProofEvent: jest.fn(),
}));
const mockGetLocalStorageData = NostrHelper.getLocalStorageData as jest.Mock;
const mockPublishProofEvent = NostrHelper.publishProofEvent as jest.Mock;

jest.mock("qrcode", () => ({
  toDataURL: jest.fn(),
}));
const mockToDataURL = QRCode.toDataURL as jest.Mock;

jest.mock("@/components/utility-components/failure-modal", () => ({
  __esModule: true,
  default: ({
    isOpen,
    bodyText,
    onClose,
  }: {
    isOpen: boolean;
    bodyText: string;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="failure-modal">
        <p>{bodyText}</p>
        <button onClick={onClose} data-testid="failure-modal-close">
          Close
        </button>
      </div>
    ) : null,
}));

jest.mock("@heroicons/react/24/outline", () => ({
  BanknotesIcon: () => <div data-testid="banknotes-icon" />,
  ClipboardIcon: (props: React.SVGProps<SVGSVGElement>) => (
    <div data-testid="clipboard-icon" {...props} />
  ),
  CheckIcon: () => <div data-testid="check-icon" />,
  InformationCircleIcon: () => <div data-testid="info-icon" />,
}));

jest.mock("@/utils/nostr/signers/nostr-nip46-signer", () => ({
  NostrNIP46Signer: jest.fn().mockImplementation(() => ({
    name: "NostrNIP46Signer",
  })),
}));

const mockSigner = { name: "mockSigner" };
const mockNostr = { relays: [] };
const mockLocalStorage = {
  mints: ["https://legend.lnbits.com/cashu/api/v1/4gr9Xcmz3e3g3pC1YyQ1e3"],
  tokens: [],
  history: [],
};

const renderComponent = (customSigner = mockSigner) => {
  return render(
    <SignerContext.Provider
      value={{ signer: customSigner, setSigner: jest.fn() }}
    >
      <NostrContext.Provider value={{ nostr: mockNostr, setNostr: jest.fn() }}>
        <MintButton />
      </NostrContext.Provider>
    </SignerContext.Provider>
  );
};

const mockWebLN = {
  enable: jest.fn(),
  isEnabled: jest.fn(),
  sendPayment: jest.fn(),
};

describe("MintButton Component", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetLocalStorageData.mockReturnValue(mockLocalStorage);
    mockToDataURL.mockResolvedValue("data:image/png;base64,mock-qr-code");
    mockPublishProofEvent.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      writable: true,
    });
    delete (window as any).webln;
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});

    const localStorageMock = {
      setItem: jest.fn(),
      getItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    };
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
    });
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    jest.clearAllMocks();
    (console.error as jest.Mock).mockRestore();
    (console.warn as jest.Mock).mockRestore();
  });

  it("should render the Mint button and open the modal on click", async () => {
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeVisible();
    });
  });

  it("should close the modal when Cancel is clicked", async () => {
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("should show validation error for invalid input", async () => {
    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    const input = screen.getByLabelText(/Token amount in sats/i);
    const submitButton = screen.getByRole("button", {
      name: /Mint/i,
      type: "submit",
    });
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.click(submitButton);
    expect(
      await screen.findByText("Please enter a whole number.")
    ).toBeVisible();
  });

  it("should handle the full successful minting process", async () => {
    const satsToMint = "100";
    const mockInvoice = "lnbc1...";
    const mockHash = "mock_hash";
    const mockProofs = [{ id: "proof1" }];

    mockCreateMintQuote.mockResolvedValue({
      request: mockInvoice,
      quote: mockHash,
    });
    mockCheckMintQuote.mockResolvedValueOnce({ state: "PAID" });
    mockMintProofs.mockResolvedValue(mockProofs);

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    fireEvent.change(screen.getByLabelText(/Token amount in sats/i), {
      target: { value: satsToMint },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mint/i, type: "submit" })
    );

    await waitFor(() => {
      expect(mockCreateMintQuote).toHaveBeenCalledWith(satsToMint);
    });

    await waitFor(() => {
      expect(mockMintProofs).toHaveBeenCalledWith(satsToMint, mockHash);
      expect(screen.getByText("Payment confirmed!")).toBeVisible();
    });
  });

  it("should handle payment timeout", async () => {
    const satsToMint = "50";
    mockCreateMintQuote.mockResolvedValue({
      request: "lnbc500...",
      quote: "hash50",
    });
    mockCheckMintQuote.mockRejectedValue(
      new TypeError("Network connection failed")
    );

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    fireEvent.change(screen.getByLabelText(/Token amount in sats/i), {
      target: { value: satsToMint },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mint/i, type: "submit" })
    );

    await waitFor(
      () => {
        expect(screen.getByTestId("failure-modal")).toBeVisible();
      },
      { timeout: 3000 }
    );

    expect(
      screen.getByText(
        "Failed to validate invoice! Change your mint in settings and/or please try again."
      )
    ).toBeVisible();
  });

  it("should handle max retries timeout", async () => {
    const satsToMint = "25";
    mockCreateMintQuote.mockResolvedValue({
      request: "lnbc250...",
      quote: "hashTimeout",
    });

    let callCount = 0;
    mockCheckMintQuote.mockImplementation(async () => {
      callCount++;
      throw new Error("Generic polling failure");
    });

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    fireEvent.change(screen.getByLabelText(/Token amount in sats/i), {
      target: { value: satsToMint },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mint/i, type: "submit" })
    );

    expect(await screen.findByText("Lightning Invoice")).toBeVisible();

    for (let retry = 0; retry < 31; retry++) {
      await act(async () => {
        jest.advanceTimersByTime(2100);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    await waitFor(
      () => {
        expect(screen.getByTestId("failure-modal")).toBeVisible();
      },
      { timeout: 5000 }
    );

    expect(
      screen.getByText(
        "Payment timed out! Please check your wallet balance or try again."
      )
    ).toBeVisible();
    expect(callCount).toBeGreaterThan(1);
  });

  it("should handle copy to clipboard functionality", async () => {
    const mockInvoice = "lnbc_very_long_invoice_string";
    mockCreateMintQuote.mockResolvedValue({
      request: mockInvoice,
      quote: "some_hash",
    });

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    fireEvent.change(screen.getByLabelText(/Token amount in sats/i), {
      target: { value: "10" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mint/i, type: "submit" })
    );

    const clipboardIcon = await screen.findByTestId("clipboard-icon");
    fireEvent.click(clipboardIcon);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockInvoice);
      expect(screen.getByTestId("check-icon")).toBeVisible();
    });

    await waitFor(() => {
      expect(clipboardIcon).toHaveClass("hidden");
    });
  });

  it("should handle QR code generation error", async () => {
    const satsToMint = "100";
    const mockInvoice = "lnbc1...";
    const mockHash = "mock_hash";

    mockCreateMintQuote.mockResolvedValue({
      request: mockInvoice,
      quote: mockHash,
    });
    mockToDataURL.mockRejectedValue(new Error("QR generation failed"));

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    fireEvent.change(screen.getByLabelText(/Token amount in sats/i), {
      target: { value: satsToMint },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mint/i, type: "submit" })
    );

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith("ERROR", expect.any(Error));
    });
  });

  it("should handle WebLN when available and enabled", async () => {
    const satsToMint = "50";
    const mockInvoice = "lnbc500...";
    const mockHash = "hash50";
    const mockProofs = [{ id: "proof1" }];

    (window as any).webln = mockWebLN;
    mockWebLN.enable.mockResolvedValue(undefined);
    mockWebLN.isEnabled.mockResolvedValue(true);
    mockWebLN.sendPayment.mockResolvedValue({ preimage: "mock_preimage" });

    mockCreateMintQuote.mockResolvedValue({
      request: mockInvoice,
      quote: mockHash,
    });
    mockCheckMintQuote.mockResolvedValue({ state: "PAID" });
    mockMintProofs.mockResolvedValue(mockProofs);

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    fireEvent.change(screen.getByLabelText(/Token amount in sats/i), {
      target: { value: satsToMint },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mint/i, type: "submit" })
    );

    await waitFor(() => {
      expect(mockWebLN.enable).toHaveBeenCalled();
      expect(mockWebLN.isEnabled).toHaveBeenCalled();
      expect(mockWebLN.sendPayment).toHaveBeenCalledWith(mockInvoice);
    });
  });

  it("should handle WebLN enable error", async () => {
    const satsToMint = "50";
    const mockInvoice = "lnbc500...";
    const mockHash = "hash50";

    (window as any).webln = mockWebLN;
    mockWebLN.enable.mockRejectedValue(new Error("WebLN enable failed"));

    mockCreateMintQuote.mockResolvedValue({
      request: mockInvoice,
      quote: mockHash,
    });

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    fireEvent.change(screen.getByLabelText(/Token amount in sats/i), {
      target: { value: satsToMint },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mint/i, type: "submit" })
    );

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  it("should handle WebLN not enabled", async () => {
    const satsToMint = "50";
    const mockInvoice = "lnbc500...";
    const mockHash = "hash50";

    (window as any).webln = mockWebLN;
    mockWebLN.enable.mockResolvedValue(undefined);
    mockWebLN.isEnabled.mockResolvedValue(false);

    mockCreateMintQuote.mockResolvedValue({
      request: mockInvoice,
      quote: mockHash,
    });

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    fireEvent.change(screen.getByLabelText(/Token amount in sats/i), {
      target: { value: satsToMint },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mint/i, type: "submit" })
    );

    await waitFor(() => {
      expect(mockWebLN.enable).toHaveBeenCalled();
      expect(mockWebLN.isEnabled).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  it("should handle WebLN sendPayment error", async () => {
    const satsToMint = "50";
    const mockInvoice = "lnbc500...";
    const mockHash = "hash50";

    (window as any).webln = mockWebLN;
    mockWebLN.enable.mockResolvedValue(undefined);
    mockWebLN.isEnabled.mockResolvedValue(true);
    mockWebLN.sendPayment.mockRejectedValue(new Error("Payment failed"));

    mockCreateMintQuote.mockResolvedValue({
      request: mockInvoice,
      quote: mockHash,
    });

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    fireEvent.change(screen.getByLabelText(/Token amount in sats/i), {
      target: { value: satsToMint },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mint/i, type: "submit" })
    );

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  it("should handle WebLN sendPayment returning null", async () => {
    const satsToMint = "50";
    const mockInvoice = "lnbc500...";
    const mockHash = "hash50";

    (window as any).webln = mockWebLN;
    mockWebLN.enable.mockResolvedValue(undefined);
    mockWebLN.isEnabled.mockResolvedValue(true);
    mockWebLN.sendPayment.mockResolvedValue(null);

    mockCreateMintQuote.mockResolvedValue({
      request: mockInvoice,
      quote: mockHash,
    });

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    fireEvent.change(screen.getByLabelText(/Token amount in sats/i), {
      target: { value: satsToMint },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mint/i, type: "submit" })
    );

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  it("should handle ISSUED state in invoice polling", async () => {
    const satsToMint = "75";
    const mockInvoice = "lnbc750...";
    const mockHash = "hash75";

    mockCreateMintQuote.mockResolvedValue({
      request: mockInvoice,
      quote: mockHash,
    });
    mockCheckMintQuote.mockResolvedValue({ state: "ISSUED" });

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    fireEvent.change(screen.getByLabelText(/Token amount in sats/i), {
      target: { value: satsToMint },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mint/i, type: "submit" })
    );

    await waitFor(() => {
      expect(screen.getByText("Payment confirmed!")).toBeVisible();
    });

    await waitFor(() => {
      expect(screen.getByTestId("failure-modal")).toBeVisible();
    });

    expect(
      screen.getByText(
        "Payment was received but your connection dropped! Please check your wallet balance."
      )
    ).toBeVisible();
  });

  it('should handle mint error with "issued" message', async () => {
    const satsToMint = "80";
    const mockInvoice = "lnbc800...";
    const mockHash = "hash80";

    mockCreateMintQuote.mockResolvedValue({
      request: mockInvoice,
      quote: mockHash,
    });
    mockCheckMintQuote.mockResolvedValue({ state: "PAID" });
    mockMintProofs.mockRejectedValue(new Error("Token already issued"));

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    fireEvent.change(screen.getByLabelText(/Token amount in sats/i), {
      target: { value: satsToMint },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mint/i, type: "submit" })
    );

    await waitFor(() => {
      expect(screen.getByText("Payment confirmed!")).toBeVisible();
    });

    await waitFor(() => {
      expect(screen.getByTestId("failure-modal")).toBeVisible();
    });

    expect(
      screen.getByText(
        "Payment was received but your connection dropped! Please check your wallet balance."
      )
    ).toBeVisible();
  });

  it("should close failure modal when close button is clicked", async () => {
    const satsToMint = "50";
    mockCreateMintQuote.mockResolvedValue({
      request: "lnbc500...",
      quote: "hash50",
    });
    mockCheckMintQuote.mockRejectedValue(
      new TypeError("Network connection failed")
    );

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    fireEvent.change(screen.getByLabelText(/Token amount in sats/i), {
      target: { value: satsToMint },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mint/i, type: "submit" })
    );

    await waitFor(() => {
      expect(screen.getByTestId("failure-modal")).toBeVisible();
    });

    fireEvent.click(screen.getByTestId("failure-modal-close"));

    await waitFor(() => {
      expect(screen.queryByTestId("failure-modal")).not.toBeInTheDocument();
    });
  });

  it("should handle UNPAID state and continue polling", async () => {
    const satsToMint = "60";
    const mockInvoice = "lnbc600...";
    const mockHash = "hash60";
    const mockProofs = [{ id: "proof1" }];

    mockCreateMintQuote.mockResolvedValue({
      request: mockInvoice,
      quote: mockHash,
    });

    let callCount = 0;
    mockCheckMintQuote.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { state: "UNPAID" };
      } else {
        return { state: "PAID" };
      }
    });

    mockMintProofs.mockResolvedValue(mockProofs);

    renderComponent();
    fireEvent.click(screen.getByRole("button", { name: /Mint/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    fireEvent.change(screen.getByLabelText(/Token amount in sats/i), {
      target: { value: satsToMint },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Mint/i, type: "submit" })
    );

    expect(await screen.findByText("Lightning Invoice")).toBeVisible();

    // Advance time to trigger the retry
    await act(async () => {
      jest.advanceTimersByTime(2100);
      await Promise.resolve();
    });

    await waitFor(
      () => {
        expect(screen.getByText("Payment confirmed!")).toBeVisible();
      },
      { timeout: 5000 }
    );

    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});
