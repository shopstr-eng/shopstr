import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import userEvent from "@testing-library/user-event";
import ReceiveButton from "../receive-button";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { CashuWalletContext } from "@/utils/context/context";
import { getDecodedToken, Wallet as CashuWallet } from "@cashu/cashu-ts";
import {
  getLocalStorageData,
  publishProofEvent,
  publishWalletEvent,
} from "@/utils/nostr/nostr-helper-functions";
import { NostrNIP46Signer } from "@/utils/nostr/signers/nostr-nip46-signer";
import {
  checkMintP2pkSupport,
  parseP2PKProofSet,
} from "@/utils/cashu/p2pk-checkout";

jest.setTimeout(15000);

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  getLocalStorageData: jest.fn(),
  publishProofEvent: jest.fn(),
  publishWalletEvent: jest.fn(),
}));
jest.mock("@cashu/cashu-ts", () => ({
  ...jest.requireActual("@cashu/cashu-ts"),
  getDecodedToken: jest.fn(),
  Mint: jest.fn().mockImplementation(() => ({})),
  Wallet: jest.fn().mockImplementation(() => ({
    loadMint: jest.fn().mockResolvedValue(undefined),
    checkProofsStates: jest.fn(),
  })),
}));
jest.mock("@heroui/react", () => {
  const React = require("react");
  const Passthrough = ({ children }: { children: any }) =>
    React.createElement("div", null, children);

  return {
    Modal: ({
      children,
      isDismissable,
      isOpen,
      onClose,
    }: {
      children: any;
      isDismissable?: boolean;
      isOpen: boolean;
      onClose?: () => void;
    }) =>
      isOpen
        ? React.createElement(
            "div",
            { role: "dialog" },
            isDismissable
              ? React.createElement(
                  "button",
                  { onClick: onClose, type: "button" },
                  "Close"
                )
              : null,
            children
          )
        : null,
    ModalContent: Passthrough,
    ModalHeader: Passthrough,
    ModalBody: Passthrough,
    ModalFooter: Passthrough,
    Button: ({
      children,
      isDisabled,
      onClick,
      startContent,
      type,
    }: {
      children: any;
      isDisabled?: boolean;
      onClick?: () => void;
      startContent?: any;
      type?: "button" | "submit";
    }) =>
      React.createElement(
        "button",
        { disabled: isDisabled, onClick, type: type ?? "button" },
        startContent,
        children
      ),
    Textarea: ({
      label,
      value,
      onChange,
      onBlur,
      placeholder,
      errorMessage,
    }: {
      label?: string;
      value?: string;
      onChange?: (event: unknown) => void;
      onBlur?: () => void;
      placeholder?: string;
      errorMessage?: string;
    }) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement("textarea", {
          "aria-label": label,
          onBlur,
          onChange,
          placeholder,
          value,
        }),
        errorMessage ? React.createElement("div", null, errorMessage) : null
      ),
  };
});
jest.mock("@/utils/nostr/signers/nostr-nip46-signer");
jest.mock("@/utils/cashu/p2pk-checkout", () => ({
  checkMintP2pkSupport: jest.fn().mockResolvedValue({ supported: true }),
  parseP2PKProofSet: jest.fn().mockReturnValue({ p2pk: null }),
}));
jest.mock("@heroicons/react/24/outline", () => ({
  ArrowDownTrayIcon: () => <div data-testid="arrow-icon" />,
  CheckCircleIcon: () => <div data-testid="check-icon" />,
  XCircleIcon: () => <div data-testid="x-icon" />,
  InformationCircleIcon: () => <div data-testid="info-icon" />,
}));

const mockGetLocalStorageData = getLocalStorageData as jest.Mock;
const mockGetDecodedToken = getDecodedToken as jest.Mock;
const mockPublishProofEvent = publishProofEvent as jest.Mock;
const mockPublishWalletEvent = publishWalletEvent as jest.Mock;
const MockCashuWallet = CashuWallet as jest.Mock;
const mockParseP2PKProofSet = parseP2PKProofSet as jest.Mock;
const mockCheckMintP2pkSupport = checkMintP2pkSupport as jest.Mock;
const mockSigner = {
  connect: jest.fn(),
  getPubKey: jest.fn().mockResolvedValue("mock-pubkey"),
  sign: jest.fn(),
  encrypt: jest.fn(),
  decrypt: jest.fn(),
  close: jest.fn(),
  toJSON: jest.fn(),
} as any;
const mockNostr = { pool: {} } as any;

const renderWithProviders = (
  ui: React.ReactElement,
  {
    signer = mockSigner as any,
    nostr = mockNostr as any,
    cashuWallet = {
      proofEvents: [],
      cashuMints: [],
      cashuProofs: [],
      isLoading: false,
      cashuPubkey: "02buyer".padEnd(64, "0"),
      cashuPrivkey: "aabbccdd".repeat(8),
    } as any,
  } = {}
) => {
  return render(
    <NostrContext.Provider value={{ nostr } as any}>
      <SignerContext.Provider value={{ signer } as any}>
        <CashuWalletContext.Provider value={cashuWallet}>
          {ui}
        </CashuWalletContext.Provider>
      </SignerContext.Provider>
    </NostrContext.Provider>
  );
};

const VALID_TOKEN =
  "cashuAeyJtaW50IjoiaHR0cHM6Ly84MzM0Y2FzaHUubG5iaXRzLmNvbS9hcGkvdjEvOThiY2E0ZGRjYTc5NGMyZmE0NzUwY2U4Y2QyM2Q3M2QiLCJwcm9vZnMiOlt7ImlkIjoiL0Y5eU9zYmNaFHYiLCJhbW91bnQiOjEsInNlY3JldCI6IjF4czRNYjZnaGFaWiIsIkMiOiIwMmE4OTExYWYyYTRkYWI0YmI4Y2M1N2FkZjMyYzExYjgzYjU5YmJjYjZlMTEyMmFmODNlNzMzYTM5MjY0Y2I1ZGYifV19";

describe("ReceiveButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Storage.prototype.setItem = jest.fn();
    mockGetLocalStorageData.mockReturnValue({
      mints: [],
      tokens: [],
      history: [],
    });
    mockPublishProofEvent.mockResolvedValue(undefined);
    mockPublishWalletEvent.mockResolvedValue(undefined);
    mockParseP2PKProofSet.mockReturnValue({ p2pk: null });
    mockCheckMintP2pkSupport.mockResolvedValue({ supported: true });
  });

  test("renders the receive button and opens/closes the modal", async () => {
    renderWithProviders(<ReceiveButton />);
    const receiveButton = screen.getByRole("button", { name: /Receive/i });
    fireEvent.click(receiveButton);
    const modal = await screen.findByRole("dialog");
    expect(modal).toBeInTheDocument();
    const cancelButton = within(modal).getByRole("button", { name: /Cancel/i });
    fireEvent.click(cancelButton);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  test("shows validation error for empty token submission", async () => {
    renderWithProviders(<ReceiveButton />);
    fireEvent.click(screen.getByRole("button", { name: /Receive/i }));
    const modal = await screen.findByRole("dialog");
    const submitButton = within(modal).getByRole("button", {
      name: /Receive/i,
    });
    fireEvent.click(submitButton);
    expect(
      await within(modal).findByText("A Cashu token string is required.")
    ).toBeVisible();
  });

  test("shows validation error for invalid token format", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReceiveButton />);
    fireEvent.click(screen.getByRole("button", { name: /Receive/i }));
    const modal = await screen.findByRole("dialog");
    const tokenInput = within(modal).getByLabelText(/Cashu token string/i);
    await user.type(tokenInput, "invalid-token-string");
    const submitButton = within(modal).getByRole("button", {
      name: /Receive/i,
    });
    fireEvent.click(submitButton);
    const errorMessage =
      "The token must start with 'web+cashu://', 'cashu://', 'cashu:', or 'cashu' followed by a versioning letter.";
    expect(await within(modal).findByText(errorMessage)).toBeVisible();
  });

  test("successfully receives a valid token and closes the success modal", async () => {
    const user = userEvent.setup();
    const mockProofs = [
      {
        id: "test",
        amount: { toNumber: () => 10 },
        secret: "secret",
        C: "C1",
      },
    ];
    mockGetDecodedToken.mockReturnValue({
      mint: "https://testmint.com",
      proofs: mockProofs,
    });
    MockCashuWallet.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkProofsStates: jest
        .fn()
        .mockResolvedValue([{ state: "UNSPENT", Y: "Y1" }]),
    }));

    renderWithProviders(<ReceiveButton />);
    fireEvent.click(screen.getByRole("button", { name: /Receive/i }));

    const receiveModal = await screen.findByRole("dialog");
    const tokenInput =
      within(receiveModal).getByLabelText(/Cashu token string/i);
    await user.type(tokenInput, VALID_TOKEN);

    const submitButton = within(receiveModal).getByRole("button", {
      name: /Receive/i,
    });
    fireEvent.click(submitButton);

    const successModal = await screen.findByText("Token successfully claimed!");
    expect(successModal).toBeInTheDocument();

    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);
    await waitFor(() => {
      expect(
        screen.queryByText("Token successfully claimed!")
      ).not.toBeInTheDocument();
    });
  });

  test("swaps P2PK tokens through wallet.receive before storing fresh proofs", async () => {
    const user = userEvent.setup();
    const lockedProof = {
      id: "test",
      amount: { toNumber: () => 10 },
      secret: '["P2PK",{"data":"02seller","tags":[["locktime","9999999999"]]}]',
      C: "C_locked",
    };
    const freshProof = {
      id: "test",
      amount: { toNumber: () => 10 },
      secret: "fresh-secret",
      C: "C_fresh",
    };
    const receive = jest.fn().mockResolvedValue([freshProof]);
    const checkProofsStates = jest.fn();
    mockParseP2PKProofSet.mockReturnValue({
      p2pk: {
        pubkey: "02seller".padEnd(66, "0"),
        locktime: 9999999999,
        refundKeys: [],
        expired: false,
        rawTags: [],
      },
    });
    mockGetDecodedToken.mockReturnValue({
      mint: "https://testmint.com",
      proofs: [lockedProof],
    });
    MockCashuWallet.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkProofsStates,
      receive,
    }));

    renderWithProviders(<ReceiveButton />);
    fireEvent.click(screen.getByRole("button", { name: /Receive/i }));

    const receiveModal = await screen.findByRole("dialog");
    await user.type(
      within(receiveModal).getByLabelText(/Cashu token string/i),
      VALID_TOKEN
    );
    fireEvent.click(
      within(receiveModal).getByRole("button", { name: /Receive/i })
    );

    await waitFor(() =>
      expect(receive).toHaveBeenCalledWith([lockedProof], {
        privkey: "aabbccdd".repeat(8),
      })
    );
    expect(checkProofsStates).not.toHaveBeenCalled();
    expect(Storage.prototype.setItem).toHaveBeenCalledWith(
      "tokens",
      JSON.stringify([freshProof])
    );
    expect(Storage.prototype.setItem).not.toHaveBeenCalledWith(
      "tokens",
      JSON.stringify([lockedProof])
    );
    expect(mockPublishProofEvent).toHaveBeenCalledWith(
      mockNostr,
      mockSigner,
      "https://testmint.com",
      [freshProof],
      "in",
      "10"
    );
  });

  test("shows an error modal for spent tokens and closes it", async () => {
    const user = userEvent.setup();
    mockGetDecodedToken.mockReturnValue({
      mint: "https://testmint.com",
      proofs: [
        {
          id: "test",
          amount: { toNumber: () => 10 },
          secret: "secret",
          C: "C1",
        },
      ],
    });
    MockCashuWallet.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkProofsStates: jest
        .fn()
        .mockResolvedValue([{ state: "SPENT", Y: "Y1" }]),
    }));

    renderWithProviders(<ReceiveButton />);
    fireEvent.click(screen.getByRole("button", { name: /Receive/i }));

    const receiveModal = await screen.findByRole("dialog");
    const tokenInput =
      within(receiveModal).getByLabelText(/Cashu token string/i);
    await user.type(tokenInput, VALID_TOKEN);
    const submitButton = within(receiveModal).getByRole("button", {
      name: /Receive/i,
    });
    fireEvent.click(submitButton);

    const errorModal = await screen.findByText("Spent token!");
    expect(errorModal).toBeInTheDocument();

    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);
    await waitFor(() => {
      expect(screen.queryByText("Spent token!")).not.toBeInTheDocument();
    });
  });

  test("shows an error modal for duplicate tokens and closes it", async () => {
    const user = userEvent.setup();
    const mockProof = {
      id: "test",
      amount: { toNumber: () => 10 },
      secret: "secret",
      C: "C1",
    };
    mockGetLocalStorageData.mockReturnValue({
      mints: [],
      tokens: [mockProof],
      history: [],
    });
    mockGetDecodedToken.mockReturnValue({
      mint: "https://testmint.com",
      proofs: [mockProof],
    });
    MockCashuWallet.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkProofsStates: jest
        .fn()
        .mockResolvedValue([{ state: "UNSPENT", Y: "Y1" }]),
    }));

    renderWithProviders(<ReceiveButton />);
    fireEvent.click(screen.getByRole("button", { name: /Receive/i }));

    const receiveModal = await screen.findByRole("dialog");
    await user.type(
      within(receiveModal).getByLabelText(/Cashu token string/i),
      VALID_TOKEN
    );
    fireEvent.click(
      within(receiveModal).getByRole("button", { name: /Receive/i })
    );

    const errorModal = await screen.findByText("Duplicate token!");
    expect(errorModal).toBeInTheDocument();

    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);
    await waitFor(() => {
      expect(screen.queryByText("Duplicate token!")).not.toBeInTheDocument();
    });
  });

  test("shows an error modal for invalid token strings and closes it", async () => {
    const user = userEvent.setup();
    mockGetDecodedToken.mockImplementation(() => {
      throw new Error("Invalid token");
    });

    renderWithProviders(<ReceiveButton />);
    fireEvent.click(screen.getByRole("button", { name: /Receive/i }));

    const receiveModal = await screen.findByRole("dialog");
    await user.type(
      within(receiveModal).getByLabelText(/Cashu token string/i),
      VALID_TOKEN
    );
    fireEvent.click(
      within(receiveModal).getByRole("button", { name: /Receive/i })
    );

    const errorModal = await screen.findByText("Invalid token!");
    expect(errorModal).toBeInTheDocument();

    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);
    await waitFor(() => {
      expect(screen.queryByText("Invalid token!")).not.toBeInTheDocument();
    });
  });

  test("shows info message when signer is NostrNIP46Signer", async () => {
    const nip46Signer = new NostrNIP46Signer(
      { bunker: "bunker://dummy@dummy" },
      jest.fn()
    );
    renderWithProviders(<ReceiveButton />, { signer: nip46Signer as any });
    fireEvent.click(screen.getByRole("button", { name: /Receive/i }));
    const modal = await screen.findByRole("dialog");
    const infoMessage =
      "If the token is taking a while to be received, make sure to check your bunker application to approve the transaction events.";
    expect(
      await within(modal).findByText(infoMessage, { exact: false })
    ).toBeInTheDocument();
  });
});
