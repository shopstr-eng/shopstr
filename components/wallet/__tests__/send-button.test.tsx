import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import userEvent from "@testing-library/user-event";
import SendButton from "../send-button";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { CashuWalletContext } from "@/utils/context/context";
import { CashuWallet, getEncodedToken } from "@cashu/cashu-ts";
import {
  getLocalStorageData,
  publishProofEvent,
} from "@/utils/nostr/nostr-helper-functions";
import { NostrNIP46Signer } from "@/utils/nostr/signers/nostr-nip46-signer";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { ChallengeHandler } from "@/utils/nostr/signers/nostr-signer";

jest.setTimeout(20000);

jest.mock("@cashu/cashu-ts");
jest.mock("@/utils/nostr/nostr-helper-functions");
jest.mock("@/utils/nostr/signers/nostr-nip46-signer");
jest.mock("@/utils/nostr/nostr-manager");

const MockedNostrNIP46Signer = NostrNIP46Signer as jest.MockedClass<
  typeof NostrNIP46Signer
>;
const MockedNostrManager = NostrManager as jest.MockedClass<
  typeof NostrManager
>;

const mockChallengeHandler: jest.MockedFunction<ChallengeHandler> = jest
  .fn()
  .mockResolvedValue({ res: "response", remind: false });

jest.mock("@heroicons/react/24/outline", () => ({
  ArrowUpTrayIcon: () => <div data-testid="arrow-up-icon" />,
  ClipboardIcon: () => <div data-testid="clipboard-icon" />,
  CheckIcon: () => <div data-testid="check-icon" />,
  CheckCircleIcon: () => <div data-testid="check-circle-icon" />,
  InformationCircleIcon: () => <div data-testid="info-icon" />,
  XCircleIcon: () => <div data-testid="x-circle-icon" />,
}));

const mockGetLocalStorageData = getLocalStorageData as jest.Mock;
const mockPublishProofEvent = publishProofEvent as jest.Mock;
const mockGetEncodedToken = getEncodedToken as jest.Mock;
const MockCashuWallet = CashuWallet as jest.Mock;

const mockSigner = {
  getPublicKey: jest.fn().mockResolvedValue("mock-pubkey"),
  getPubKey: jest.fn().mockResolvedValue("mock-pubkey"),
  sign: jest.fn(),
  encrypt: jest.fn(),
  decrypt: jest.fn(),
  nip04: {
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  },
  nip44: {
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  },
  connect: jest.fn(),
  close: jest.fn(),
  toJSON: jest.fn(),
};

const mockNostr = new MockedNostrManager();
const mockWalletContext = {
  proofEvents: [{ id: "event1", proofs: [{ id: "keyset_id_1", C: "C1" }] }],
  cashuMints: [],
  cashuProofs: [],
  isLoading: false,
};

const renderWithProviders = (
  ui: React.ReactElement,
  {
    signer = mockSigner,
    nostr = mockNostr,
    walletContext = mockWalletContext,
  } = {}
) => {
  return render(
    <NostrContext.Provider value={{ nostr }}>
      <SignerContext.Provider value={{ signer }}>
        <CashuWalletContext.Provider value={walletContext}>
          {ui}
        </CashuWalletContext.Provider>
      </SignerContext.Provider>
    </NostrContext.Provider>
  );
};

describe("SendButton", () => {
  let setItemSpy: jest.SpyInstance;
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, "now").mockImplementation(() => 1758309680000);

    mockSend = jest.fn();
    MockCashuWallet.mockImplementation(() => ({
      getKeySets: jest.fn().mockResolvedValue([{ id: "keyset_id_1" }]),
      send: mockSend,
    }));

    setItemSpy = jest.spyOn(Storage.prototype, "setItem");
    mockPublishProofEvent.mockResolvedValue(undefined);
    mockGetLocalStorageData.mockReturnValue({
      mints: ["https://legend.lnbits.com/cashu/api/v1/4_sadf7asdf78"],
      tokens: [{ id: "keyset_id_1", amount: 1000, C: "C1" }],
      history: [],
    });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      writable: true,
    });
  });

  afterEach(() => {
    setItemSpy.mockRestore();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("renders button and handles modal open/close", async () => {
    renderWithProviders(<SendButton />);
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    const modal = await screen.findByRole("dialog");
    await userEvent.click(
      within(modal).getByRole("button", { name: /Cancel/i })
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  test("shows validation errors for invalid input", async () => {
    renderWithProviders(<SendButton />);
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    const modal = await screen.findByRole("dialog");
    await userEvent.click(within(modal).getByRole("button", { name: /Send/i }));
    expect(
      await within(modal).findByText("A whole number is required.")
    ).toBeVisible();
  });

  test("handles a successful send transaction", async () => {
    const mockSendResult = {
      keep: [{ id: "keyset_id_1", amount: 900 }],
      send: [{ id: "keyset_id_1", amount: 100 }],
    };
    mockSend.mockResolvedValue(mockSendResult);
    mockGetEncodedToken.mockReturnValue("cashuA_mock_token");

    renderWithProviders(<SendButton />);
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    const modal = await screen.findByRole("dialog");
    await userEvent.type(
      within(modal).getByLabelText(/Token amount in sats/i),
      "100"
    );
    await userEvent.click(within(modal).getByRole("button", { name: /Send/i }));

    await screen.findByText("New token string is ready to be copied and sent!");

    const historyCall = setItemSpy.mock.calls.find(
      (call) => call[0] === "history"
    );
    expect(historyCall).toBeDefined();
    const historyData = JSON.parse(historyCall![1]);
    expect(historyData[0]).toMatchObject({
      type: 2,
      amount: 100,
    });
  });

  test("handles send with no change proofs", async () => {
    const mockSendResult = {
      keep: [],
      send: [{ id: "keyset_id_1", amount: 100 }],
    };
    mockSend.mockResolvedValue(mockSendResult);
    mockGetEncodedToken.mockReturnValue("cashuA_mock_token_no_change");

    renderWithProviders(<SendButton />);
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    const modal = await screen.findByRole("dialog");
    await userEvent.type(
      within(modal).getByLabelText(/Token amount in sats/i),
      "100"
    );
    await userEvent.click(within(modal).getByRole("button", { name: /Send/i }));

    await screen.findByText("New token string is ready to be copied and sent!");
    expect(mockPublishProofEvent).toHaveBeenCalledWith(
      mockNostr,
      mockSigner,
      "https://legend.lnbits.com/cashu/api/v1/4_sadf7asdf78",
      [],
      "out",
      "100",
      expect.any(Array)
    );
  });

  test("handles input validation for non-numeric values", async () => {
    renderWithProviders(<SendButton />);
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    const modal = await screen.findByRole("dialog");
    const input = within(modal).getByLabelText(/Token amount in sats/i);

    await userEvent.type(input, "abc");
    await userEvent.click(within(modal).getByRole("button", { name: /Send/i }));

    expect(
      await within(modal).findByText("Please enter a whole number.")
    ).toBeVisible();
  });

  test("handles input validation for values exceeding max length", async () => {
    renderWithProviders(<SendButton />);
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    const modal = await screen.findByRole("dialog");
    const input = within(modal).getByLabelText(/Token amount in sats/i);

    const longString = "1".repeat(501);
    await userEvent.type(input, longString);
    await userEvent.click(within(modal).getByRole("button", { name: /Send/i }));

    expect(
      await within(modal).findByText("This input exceed maxLength of 500.")
    ).toBeVisible();
  });

  test("resets form and states when modal is toggled", async () => {
    mockSend.mockRejectedValue(new Error("Insufficient funds"));

    renderWithProviders(<SendButton />);
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    let modal = await screen.findByRole("dialog");
    await userEvent.type(
      within(modal).getByLabelText(/Token amount in sats/i),
      "2000"
    );
    await userEvent.click(within(modal).getByRole("button", { name: /Send/i }));

    expect(await screen.findByText("Send failed!")).toBeVisible();

    await userEvent.click(
      within(modal).getByRole("button", { name: /Cancel/i })
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    modal = await screen.findByRole("dialog");

    expect(within(modal).getByLabelText(/Token amount in sats/i)).toHaveValue(
      ""
    );
    expect(screen.queryByText("Send failed!")).not.toBeInTheDocument();
  });

  test("handles tokens with different keyset IDs", async () => {
    mockGetLocalStorageData.mockReturnValue({
      mints: ["https://legend.lnbits.com/cashu/api/v1/4_sadf7asdf78"],
      tokens: [
        { id: "keyset_id_1", amount: 500, C: "C1" },
        { id: "keyset_id_2", amount: 300, C: "C2" },
        { id: "keyset_id_3", amount: 200, C: "C3" },
      ],
      history: [],
    });

    MockCashuWallet.mockImplementation(() => ({
      getKeySets: jest
        .fn()
        .mockResolvedValue([{ id: "keyset_id_1" }, { id: "keyset_id_2" }]),
      send: jest.fn().mockResolvedValue({
        keep: [{ id: "keyset_id_1", amount: 400 }],
        send: [{ id: "keyset_id_1", amount: 100 }],
      }),
    }));

    mockGetEncodedToken.mockReturnValue("cashuA_filtered_token");

    renderWithProviders(<SendButton />);
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    const modal = await screen.findByRole("dialog");
    await userEvent.type(
      within(modal).getByLabelText(/Token amount in sats/i),
      "100"
    );
    await userEvent.click(within(modal).getByRole("button", { name: /Send/i }));

    await screen.findByText("New token string is ready to be copied and sent!");

    // Verify that tokens are filtered and stored correctly
    // Should include the remaining proof with keyset_id_3 plus the change proof
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "tokens",
      expect.stringContaining("keyset_id_3")
    );
  });

  test("handles a failed send transaction", async () => {
    mockSend.mockRejectedValue(new Error("Insufficient funds"));

    renderWithProviders(<SendButton />);
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    const modal = await screen.findByRole("dialog");
    await userEvent.type(
      within(modal).getByLabelText(/Token amount in sats/i),
      "2000"
    );
    await userEvent.click(within(modal).getByRole("button", { name: /Send/i }));

    expect(await screen.findByText("Send failed!")).toBeVisible();
    expect(
      screen.getByText(/You don't have enough funds to send/)
    ).toBeVisible();
  });

  test("shows NIP-46 info when using a bunker signer", async () => {
    const nip46Signer = new MockedNostrNIP46Signer(
      { bunker: "bunker://dummy" },
      mockChallengeHandler
    );
    renderWithProviders(<SendButton />, { signer: nip46Signer });
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    expect(
      await screen.findByText(/If the token is taking a while to be generated/i)
    ).toBeVisible();
  });

  test("handles send to nostr contact", async () => {
    const mockSendResult = {
      keep: [{ id: "keyset_id_1", amount: 900 }],
      send: [{ id: "keyset_id_1", amount: 100 }],
    };
    mockSend.mockResolvedValue(mockSendResult);
    mockGetEncodedToken.mockReturnValue("cashuA_mock_token_nostr");

    const nip46Signer = new MockedNostrNIP46Signer(
      { bunker: "bunker://dummy" },
      mockChallengeHandler
    );
    renderWithProviders(<SendButton />, { signer: nip46Signer });
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));
    const modal = await screen.findByRole("dialog");
    await userEvent.type(
      within(modal).getByLabelText(/Token amount in sats/i),
      "100"
    );
    await userEvent.click(within(modal).getByRole("button", { name: /Send/i }));

    await screen.findByText("New token string is ready to be copied and sent!");
  });
});
