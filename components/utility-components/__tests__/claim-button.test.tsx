import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ClaimButton from "../claim-button";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import {
  ProfileMapContext,
  ChatsContext,
  CashuWalletContext,
} from "@/utils/context/context";
import {
  getDecodedToken,
  getTokenMetadata,
  Wallet as CashuWallet,
} from "@cashu/cashu-ts";
import { generateKeys } from "@/utils/nostr/key-utilities";
import {
  getLocalStorageData,
  publishProofEvent,
  publishWalletEvent,
} from "@/utils/nostr/nostr-helper-functions";
import {
  checkMintP2pkSupport,
  parseP2PKProofSet,
} from "@/utils/cashu/p2pk-checkout";
import { safeSwap } from "@/utils/cashu/swap-retry-service";
import { safeMeltProofs } from "@/utils/cashu/melt-retry-service";

jest.setTimeout(15000);

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("@/utils/nostr/key-utilities", () => ({
  generateKeys: jest.fn(),
}));
jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  getLocalStorageData: jest.fn(),
  publishProofEvent: jest.fn(),
  publishWalletEvent: jest.fn(),
  constructGiftWrappedEvent: jest.fn(),
  constructMessageSeal: jest.fn(),
  constructMessageGiftWrap: jest.fn(),
  sendGiftWrappedMessageEvent: jest.fn(),
}));

jest.mock("@cashu/cashu-ts", () => ({
  ...jest.requireActual("@cashu/cashu-ts"),
  getDecodedToken: jest.fn(),
  getTokenMetadata: jest.fn(),
  getEncodedToken: jest.fn().mockReturnValue("cashuAtoken"),
  Mint: jest.fn().mockImplementation(() => ({})),
  Wallet: jest.fn().mockImplementation(() => ({
    loadMint: jest.fn().mockResolvedValue(undefined),
    checkProofsStates: jest.fn().mockResolvedValue([]),
    receive: jest.fn().mockResolvedValue([]),
    createMeltQuoteBolt11: jest.fn(),
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
    ModalBody: Passthrough,
    ModalHeader: Passthrough,
    Button: ({
      children,
      isDisabled,
      onClick,
      startContent,
    }: {
      children: any;
      isDisabled?: boolean;
      onClick?: () => void;
      startContent?: any;
    }) =>
      React.createElement(
        "button",
        { disabled: isDisabled, onClick, type: "button" },
        startContent,
        children
      ),
    Spinner: () => React.createElement("span", { "data-testid": "spinner" }),
  };
});

jest.mock("@/utils/cashu/p2pk-checkout", () => ({
  checkMintP2pkSupport: jest.fn().mockResolvedValue({ supported: true }),
  parseP2PKProofSet: jest.fn().mockReturnValue({ p2pk: null }),
  pubkeysEqual: jest.fn(
    (left?: string, right?: string) => left?.slice(-64) === right?.slice(-64)
  ),
}));

jest.mock("@/utils/cashu/swap-retry-service", () => ({
  safeSwap: jest.fn(),
}));

jest.mock("@/utils/cashu/melt-retry-service", () => ({
  safeMeltProofs: jest.fn(),
}));

jest.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

jest.mock("nostr-tools", () => ({
  nip19: {
    decode: jest.fn().mockReturnValue({ type: "npub", data: "decoded-key" }),
  },
}));

jest.mock("@getalby/lightning-tools", () => ({
  LightningAddress: jest.fn().mockImplementation(() => ({
    fetch: jest.fn().mockResolvedValue(undefined),
    requestInvoice: jest.fn().mockResolvedValue({
      paymentRequest: "lnbc1test",
    }),
  })),
}));

jest.mock("@heroicons/react/24/outline", () => ({
  ArrowDownTrayIcon: () => <div data-testid="arrow-icon" />,
  BoltIcon: () => <div data-testid="bolt-icon" />,
  CheckCircleIcon: () => <div data-testid="check-icon" />,
  XCircleIcon: () => <div data-testid="x-icon" />,
}));

// ── Typed mock handles ────────────────────────────────────────────────────────

const mockGetLocalStorageData = getLocalStorageData as jest.Mock;
const mockGetDecodedToken = getDecodedToken as jest.Mock;
const mockGetTokenMetadata = getTokenMetadata as jest.Mock;
const mockPublishProofEvent = publishProofEvent as jest.Mock;
const mockPublishWalletEvent = publishWalletEvent as jest.Mock;
const mockGenerateKeys = generateKeys as jest.Mock;
const mockCheckMintP2pkSupport = checkMintP2pkSupport as jest.Mock;
const mockParseP2PKProofSet = parseP2PKProofSet as jest.Mock;
const mockSafeSwap = safeSwap as jest.Mock;
const mockSafeMeltProofs = safeMeltProofs as jest.Mock;
const MockCashuWallet = CashuWallet as jest.Mock;

// ── Shared fixtures ───────────────────────────────────────────────────────────

const CASHU_PRIVKEY = "aabbccdd".repeat(8); // 64-char hex
const CASHU_PUBKEY = "02aabbcc".padEnd(64, "0");

const mockProof = {
  id: "keyset1",
  amount: { toNumber: () => 100 },
  secret: "plain-secret",
  C: "C_plain_1",
};

const mockFreshProof = {
  id: "keyset1",
  amount: { toNumber: () => 100 },
  secret: "fresh-secret",
  C: "C_fresh_1",
};

const mockP2PKProof = {
  id: "keyset1",
  amount: { toNumber: () => 100 },
  secret: '["P2PK","{"data":"02seller","tags":[["locktime",9999999999]]}"]',
  C: "C_p2pk_1",
};

const mockParsedP2PK = {
  pubkey: "02seller" + "0".repeat(56),
  locktime: Math.floor(Date.now() / 1000) + 86400 * 7,
  refundKeys: ["02buyer" + "0".repeat(57)],
  expired: false,
  rawTags: [],
};

const mockSigner = {
  getPubKey: jest.fn().mockResolvedValue("user-pubkey"),
  sign: jest.fn(),
  encrypt: jest.fn(),
  decrypt: jest.fn(),
} as any;

const mockNostr = { pool: {} } as any;

function makeMockWallet(overrides: Record<string, unknown> = {}) {
  return {
    loadMint: jest.fn().mockResolvedValue(undefined),
    decodeToken: jest.fn(() => mockGetDecodedToken()),
    checkProofsStates: jest
      .fn()
      .mockResolvedValue([{ state: "UNSPENT", Y: "Y1" }]),
    receive: jest.fn().mockResolvedValue([mockFreshProof]),
    createMeltQuoteBolt11: jest.fn().mockResolvedValue({
      amount: { toNumber: () => 95 },
      fee_reserve: { toNumber: () => 3 },
    }),
    ...overrides,
  };
}

// ── Render helper ─────────────────────────────────────────────────────────────

interface ProviderOptions {
  cashuPubkey?: string;
  /** Pass false to omit cashuPrivkey from the context (simulates wallet not loaded). */
  cashuPrivkey?: string | false;
  profileLud16?: string;
}

function renderClaimButton(
  token = "cashuAtoken",
  options: ProviderOptions = {}
) {
  const {
    cashuPubkey = CASHU_PUBKEY,
    cashuPrivkey: cashuPrivkeyOption = CASHU_PRIVKEY,
    profileLud16,
  } = options;
  // false means "explicitly absent" — distinct from undefined (use default)
  const cashuPrivkey =
    cashuPrivkeyOption === false ? undefined : cashuPrivkeyOption;
  const profileData = new Map<string, any>();
  profileData.set("user-pubkey", {
    content: { lud16: profileLud16 ?? undefined },
  });

  return render(
    <NostrContext.Provider value={{ nostr: mockNostr } as any}>
      <SignerContext.Provider
        value={
          { signer: mockSigner, pubkey: "user-pubkey", isLoggedIn: true } as any
        }
      >
        <CashuWalletContext.Provider
          value={
            {
              cashuPubkey,
              cashuPrivkey,
              proofEvents: [],
              cashuMints: [],
              cashuProofs: [],
              isLoading: false,
            } as any
          }
        >
          <ProfileMapContext.Provider
            value={
              {
                profileData,
                isLoading: false,
                updateProfileData: jest.fn(),
              } as any
            }
          >
            <ChatsContext.Provider
              value={
                {
                  chatsMap: new Map(),
                  isLoading: false,
                  addNewlyCreatedMessageEvent: jest.fn(),
                  markAllMessagesAsRead: jest.fn(),
                  newOrderIds: new Set(),
                } as any
              }
            >
              <ClaimButton token={token} />
            </ChatsContext.Provider>
          </ProfileMapContext.Provider>
        </CashuWalletContext.Provider>
      </SignerContext.Provider>
    </NostrContext.Provider>
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

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
  mockCheckMintP2pkSupport.mockResolvedValue({ supported: true });
  mockGenerateKeys.mockResolvedValue({
    nsec: "nsec1test",
    npub: "npub1test",
  });
  // Default: plain token, no P2PK
  mockGetTokenMetadata.mockReturnValue({
    mint: "https://testmint.com",
    unit: "sat",
  });
  mockGetDecodedToken.mockReturnValue({
    mint: "https://testmint.com",
    proofs: [mockProof],
  });
  mockParseP2PKProofSet.mockReturnValue({ p2pk: null });
  MockCashuWallet.mockImplementation(() => makeMockWallet());
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ClaimButton — non-P2PK token (regression)", () => {
  test("loads the mint and decodes with wallet.decodeToken instead of getDecodedToken", async () => {
    const loadMint = jest.fn().mockResolvedValue(undefined);
    const decodeToken = jest.fn().mockReturnValue({
      mint: "https://testmint.com",
      proofs: [mockProof],
    });
    MockCashuWallet.mockImplementation(() =>
      makeMockWallet({ loadMint, decodeToken })
    );

    renderClaimButton("cashuAtoken");

    expect(await screen.findByText(/Claim: 100/i)).toBeInTheDocument();
    expect(mockGetTokenMetadata).toHaveBeenCalledWith("cashuAtoken");
    expect(loadMint).toHaveBeenCalled();
    expect(decodeToken).toHaveBeenCalledWith("cashuAtoken");
    expect(loadMint.mock.invocationCallOrder[0]!).toBeLessThan(
      decodeToken.mock.invocationCallOrder[0]!
    );
    expect(mockGetDecodedToken).not.toHaveBeenCalled();
  });

  test("loads the mint before checking whether claim proofs are spent", async () => {
    const loadMint = jest.fn().mockResolvedValue(undefined);
    const checkProofsStates = jest
      .fn()
      .mockResolvedValue([{ state: "SPENT", Y: "Y1" }]);
    MockCashuWallet.mockImplementation(() =>
      makeMockWallet({ loadMint, checkProofsStates })
    );

    renderClaimButton();
    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));

    await waitFor(() => expect(checkProofsStates).toHaveBeenCalled());
    expect(loadMint).toHaveBeenCalled();
    expect(loadMint.mock.invocationCallOrder[0]!).toBeLessThan(
      checkProofsStates.mock.invocationCallOrder[0]!
    );
    expect(
      await screen.findByRole("button", { name: /Claimed:/i })
    ).toBeInTheDocument();
  });

  test("renders claim button with amount", async () => {
    renderClaimButton();
    expect(await screen.findByText(/Claim: 100/i)).toBeInTheDocument();
  });

  test("opens claim-type modal on click for plain token", async () => {
    renderClaimButton();
    const btn = await screen.findByRole("button", { name: /Claim/i });
    fireEvent.click(btn);
    expect(
      await screen.findByText(/claim the token directly/i)
    ).toBeInTheDocument();
  });

  test("receive path stores original proofs and calls publishProofEvent", async () => {
    renderClaimButton();
    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Receive$/i }));

    await waitFor(() =>
      expect(mockPublishProofEvent).toHaveBeenCalledWith(
        mockNostr,
        mockSigner,
        "https://testmint.com",
        [mockProof],
        "in",
        "100"
      )
    );
    expect(Storage.prototype.setItem).toHaveBeenCalledWith(
      "tokens",
      JSON.stringify([mockProof])
    );
    // wallet.receive must NOT be called for plain proofs
    const walletInstance = MockCashuWallet.mock.results[0]!.value;
    expect(walletInstance.receive).not.toHaveBeenCalled();
  });

  test("redeem path passes NO privkey to safeSwap for plain token", async () => {
    mockSafeSwap.mockResolvedValue({
      status: "swapped",
      keep: [],
      send: [mockProof],
    });
    mockSafeMeltProofs.mockResolvedValue({
      status: "paid",
      changeProofs: [],
    });
    renderClaimButton("cashuAtoken", { profileLud16: "seller@getalby.com" });

    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Redeem$/i }));

    await waitFor(() => expect(mockSafeSwap).toHaveBeenCalled());

    const swapArgs = mockSafeSwap.mock.calls[0];
    const sendConfig = swapArgs[3].sendConfig;
    expect(sendConfig.privkey).toBeUndefined();
    expect(sendConfig.includeFees).toBe(true);
  });
});

describe("ClaimButton — P2PK guard: missing cashuPrivkey", () => {
  // Helper: render a P2PK token with no privkey, then wait for the p2pk
  // state to commit before clicking. We rely on the data-testid="p2pk-detected"
  // sentinel rendered by claim-button when p2pk state is non-null; this is the
  // only reliable synchronization point in React 19 where the [proofs] useEffect
  // commit may happen after findByRole would otherwise resolve.
  async function setupAndClickGuard() {
    mockGetDecodedToken.mockReturnValue({
      mint: "https://testmint.com",
      proofs: [mockP2PKProof],
    });
    mockParseP2PKProofSet.mockReturnValue({ p2pk: mockParsedP2PK });

    renderClaimButton("cashuAtoken", { cashuPrivkey: false });

    // findByTestId waits (with retries) until the p2pk state has committed
    // and the sentinel element is in the DOM.
    await screen.findByTestId("p2pk-detected");

    fireEvent.click(screen.getByRole("button", { name: /Claim/i }));
  }

  test("shows 'Wallet not ready' modal when privkey is absent and proof is P2PK locked", async () => {
    await setupAndClickGuard();

    expect(await screen.findByText(/Wallet not ready/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Cashu wallet identity not yet available/i)
    ).toBeInTheDocument();
    // Must not show the claim-type modal
    expect(
      screen.queryByText(/claim the token directly/i)
    ).not.toBeInTheDocument();
  });

  test("does not call wallet.receive when privkey is absent", async () => {
    await setupAndClickGuard();

    await screen.findByText(/Wallet not ready/i);

    const walletInstance = MockCashuWallet.mock.results[0]!.value;
    expect(walletInstance.receive).not.toHaveBeenCalled();
  });

  test("button remains enabled after dismissing the wallet-not-ready modal", async () => {
    await setupAndClickGuard();
    await screen.findByText(/Wallet not ready/i);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    await waitFor(() =>
      expect(screen.queryByText(/Wallet not ready/i)).not.toBeInTheDocument()
    );
    const claimBtn = screen.getByRole("button", { name: /Claim/i });
    expect(claimBtn).not.toBeDisabled();
  });
});

describe("ClaimButton — P2PK receive path", () => {
  beforeEach(() => {
    mockGetDecodedToken.mockReturnValue({
      mint: "https://testmint.com",
      proofs: [mockP2PKProof],
    });
    mockParseP2PKProofSet.mockReturnValue({ p2pk: mockParsedP2PK });
    MockCashuWallet.mockImplementation(() =>
      makeMockWallet({
        createMeltQuoteBolt11: jest.fn(),
      })
    );
  });

  test("calls wallet.loadMint() before wallet.receive()", async () => {
    renderClaimButton();

    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Receive$/i }));

    const walletInstance = MockCashuWallet.mock.results[0]!.value;
    await waitFor(() => expect(walletInstance.receive).toHaveBeenCalled());
    // loadMint must be called before receive
    const loadMintOrder = walletInstance.loadMint.mock.invocationCallOrder[0];
    const receiveOrder = walletInstance.receive.mock.invocationCallOrder[0];
    expect(loadMintOrder).toBeLessThan(receiveOrder);
  });

  test("passes cashuPrivkey into wallet.receive() config", async () => {
    renderClaimButton();

    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Receive$/i }));

    const walletInstance = MockCashuWallet.mock.results[0]!.value;
    await waitFor(() => expect(walletInstance.receive).toHaveBeenCalled());

    const [receivedProofs, config] = walletInstance.receive.mock.calls[0];
    expect(receivedProofs).toEqual([mockP2PKProof]);
    expect(config.privkey).toBe(CASHU_PRIVKEY);
  });

  test("publishes freshProofs (not locked proofs) to Nostr", async () => {
    renderClaimButton();

    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Receive$/i }));

    await waitFor(() =>
      expect(mockPublishProofEvent).toHaveBeenCalledWith(
        mockNostr,
        mockSigner,
        "https://testmint.com",
        [mockFreshProof],
        "in",
        "100"
      )
    );
    // Original locked proof must not be published
    expect(mockPublishProofEvent).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      [mockP2PKProof],
      expect.anything(),
      expect.anything()
    );
  });

  test("stores freshProofs (not locked proofs) in localStorage", async () => {
    renderClaimButton();

    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Receive$/i }));

    await waitFor(() =>
      expect(Storage.prototype.setItem).toHaveBeenCalledWith(
        "tokens",
        JSON.stringify([mockFreshProof])
      )
    );
    // Original locked proof must not be stored
    expect(Storage.prototype.setItem).not.toHaveBeenCalledWith(
      "tokens",
      JSON.stringify([mockP2PKProof])
    );
  });

  test("shows success modal after P2PK receive", async () => {
    renderClaimButton();

    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Receive$/i }));

    expect(
      await screen.findByText("Token successfully claimed!")
    ).toBeInTheDocument();
  });

  test("shows error when wallet.receive() throws", async () => {
    MockCashuWallet.mockImplementation(() =>
      makeMockWallet({
        checkProofsStates: jest.fn().mockResolvedValue([]),
        receive: jest.fn().mockRejectedValue(new Error("Mint rejected proof")),
        createMeltQuoteBolt11: jest.fn(),
      })
    );

    renderClaimButton();

    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Receive$/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Invalid Token/i })
      ).toBeInTheDocument()
    );
  });

  test("blocks P2PK receive when the mint does not advertise P2PK support", async () => {
    mockCheckMintP2pkSupport.mockResolvedValue({
      supported: false,
      reason: "Unsupported P2PK mint",
    });
    renderClaimButton();

    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Receive$/i }));

    const walletInstance = MockCashuWallet.mock.results[0]!.value;
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Invalid Token/i })
      ).toBeInTheDocument()
    );
    expect(mockCheckMintP2pkSupport).toHaveBeenCalledWith(
      "https://testmint.com"
    );
    expect(walletInstance.receive).not.toHaveBeenCalled();
    expect(mockPublishProofEvent).not.toHaveBeenCalled();
  });
});

describe("ClaimButton — P2PK redeem path", () => {
  beforeEach(() => {
    mockGetDecodedToken.mockReturnValue({
      mint: "https://testmint.com",
      proofs: [mockP2PKProof],
    });
    mockParseP2PKProofSet.mockReturnValue({ p2pk: mockParsedP2PK });
    MockCashuWallet.mockImplementation(() => makeMockWallet());
    mockSafeSwap.mockResolvedValue({
      status: "swapped",
      keep: [],
      send: [mockP2PKProof],
    });
    mockSafeMeltProofs.mockResolvedValue({
      status: "paid",
      changeProofs: [],
    });
  });

  test("passes privkey to safeSwap sendConfig for P2PK proof", async () => {
    renderClaimButton("cashuAtoken", { profileLud16: "seller@getalby.com" });

    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Redeem$/i }));

    await waitFor(() => expect(mockSafeSwap).toHaveBeenCalled());

    const swapArgs = mockSafeSwap.mock.calls[0];
    const sendConfig = swapArgs[3].sendConfig;
    expect(sendConfig.privkey).toBe(CASHU_PRIVKEY);
    expect(sendConfig.includeFees).toBe(true);
  });

  test("shows redemption success modal when melt succeeds", async () => {
    renderClaimButton("cashuAtoken", { profileLud16: "seller@getalby.com" });

    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Redeem$/i }));

    expect(
      await screen.findByText("Token successfully redeemed!")
    ).toBeInTheDocument();
  });

  test("redeem without lnurl falls back to receive path using wallet.receive()", async () => {
    // No lud16 → lnurl stays "invalid" → redeem falls through to receive(true)
    renderClaimButton("cashuAtoken", { profileLud16: undefined });

    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Redeem$/i }));

    const walletInstance = MockCashuWallet.mock.results[0]!.value;
    await waitFor(() => expect(walletInstance.receive).toHaveBeenCalled());

    const [, config] = walletInstance.receive.mock.calls[0];
    expect(config.privkey).toBe(CASHU_PRIVKEY);
    // safeSwap must NOT be called since we went through receive() not redeem()
    expect(mockSafeSwap).not.toHaveBeenCalled();
  });

  test("blocks P2PK Lightning redeem when the mint does not advertise P2PK support", async () => {
    mockCheckMintP2pkSupport.mockResolvedValue({
      supported: false,
      reason: "Unsupported P2PK mint",
    });
    renderClaimButton("cashuAtoken", { profileLud16: "seller@getalby.com" });

    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Redeem$/i }));

    await waitFor(() =>
      expect(screen.getByText("Token redemption failed!")).toBeInTheDocument()
    );
    expect(mockCheckMintP2pkSupport).toHaveBeenCalledWith(
      "https://testmint.com"
    );
    expect(mockSafeSwap).not.toHaveBeenCalled();
  });
});

// ── Refund path fixtures ──────────────────────────────────────────────────────

// refundKeys use "02"+x-only format (cashu-ts Lt normalization)
const mockParsedP2PKExpired = {
  pubkey: "02seller" + "0".repeat(56),
  locktime: Math.floor(Date.now() / 1000) - 1, // already past
  refundKeys: ["02" + CASHU_PUBKEY], // buyer's key in refund list
  expired: true,
  rawTags: [],
};

// Same proof but with an expired ParsedP2PK
const mockParsedP2PKExpiredUnauthorized = {
  ...mockParsedP2PKExpired,
  refundKeys: ["02" + "cccccccc".repeat(8)], // different key — not our wallet
};

const mockParsedP2PKNotExpired = {
  ...mockParsedP2PKExpired,
  locktime: Math.floor(Date.now() / 1000) + 86400 * 7,
  expired: false,
};

describe("ClaimButton — P2PK refund path", () => {
  beforeEach(() => {
    mockGetDecodedToken.mockReturnValue({
      mint: "https://testmint.com",
      proofs: [mockP2PKProof],
    });
    MockCashuWallet.mockImplementation(() =>
      makeMockWallet({
        createMeltQuoteBolt11: jest.fn(),
      })
    );
  });

  // Helper: render with an expired P2PK proof that authorizes this wallet,
  // then wait for the sentinel to confirm p2pk state has committed.
  async function renderExpiredRefundScenario(
    authorized = true,
    options: ProviderOptions = {}
  ) {
    mockParseP2PKProofSet.mockReturnValue({
      p2pk: authorized
        ? mockParsedP2PKExpired
        : mockParsedP2PKExpiredUnauthorized,
    });
    renderClaimButton("cashuAtoken", options);
    await screen.findByTestId("p2pk-detected");
  }

  test("shows Refund button when locktime expired and wallet key is in refundKeys", async () => {
    await renderExpiredRefundScenario();
    expect(
      await screen.findByRole("button", { name: /^Refund:/i })
    ).toBeInTheDocument();
  });

  test("does not show Refund button when locktime has not expired", async () => {
    mockParseP2PKProofSet.mockReturnValue({ p2pk: mockParsedP2PKNotExpired });
    renderClaimButton();
    await screen.findByTestId("p2pk-detected");
    expect(
      screen.queryByRole("button", { name: /^Refund:/i })
    ).not.toBeInTheDocument();
  });

  test("does not show Refund button when wallet key is not in refundKeys", async () => {
    await renderExpiredRefundScenario(false);
    expect(
      screen.queryByRole("button", { name: /^Refund:/i })
    ).not.toBeInTheDocument();
  });

  test("shows wallet-not-ready modal instead of refunding when cashuPrivkey is absent", async () => {
    await renderExpiredRefundScenario(true, { cashuPrivkey: false });

    fireEvent.click(screen.getByRole("button", { name: /^Refund:/i }));

    expect(await screen.findByText(/Wallet not ready/i)).toBeInTheDocument();
    const walletInstance = MockCashuWallet.mock.results[0]!.value;
    expect(walletInstance.receive).not.toHaveBeenCalled();
  });

  test("calls wallet.loadMint() then wallet.receive() with privkey on refund click", async () => {
    await renderExpiredRefundScenario();
    fireEvent.click(screen.getByRole("button", { name: /^Refund:/i }));

    const walletInstance = MockCashuWallet.mock.results[0]!.value;
    await waitFor(() => expect(walletInstance.receive).toHaveBeenCalled());

    const loadMintOrder = walletInstance.loadMint.mock.invocationCallOrder[0];
    const receiveOrder = walletInstance.receive.mock.invocationCallOrder[0];
    expect(loadMintOrder).toBeLessThan(receiveOrder);

    const [receivedProofs, config] = walletInstance.receive.mock.calls[0];
    expect(receivedProofs).toEqual([mockP2PKProof]);
    expect(config.privkey).toBe(CASHU_PRIVKEY);
  });

  test("stores freshProofs (not locked proofs) in localStorage after refund", async () => {
    await renderExpiredRefundScenario();
    fireEvent.click(screen.getByRole("button", { name: /^Refund:/i }));

    await waitFor(() =>
      expect(Storage.prototype.setItem).toHaveBeenCalledWith(
        "tokens",
        JSON.stringify([mockFreshProof])
      )
    );
    expect(Storage.prototype.setItem).not.toHaveBeenCalledWith(
      "tokens",
      JSON.stringify([mockP2PKProof])
    );
  });

  test("publishes freshProofs (not locked proofs) to Nostr after refund", async () => {
    await renderExpiredRefundScenario();
    fireEvent.click(screen.getByRole("button", { name: /^Refund:/i }));

    await waitFor(() =>
      expect(mockPublishProofEvent).toHaveBeenCalledWith(
        mockNostr,
        mockSigner,
        "https://testmint.com",
        [mockFreshProof],
        "in",
        "100"
      )
    );
  });

  test("shows 'Refund successful!' modal after successful refund", async () => {
    await renderExpiredRefundScenario();
    fireEvent.click(screen.getByRole("button", { name: /^Refund:/i }));

    expect(await screen.findByText("Refund successful!")).toBeInTheDocument();
    expect(screen.getByText(/funds have been returned/i)).toBeInTheDocument();
  });

  test("refund button shows 'Refunded' text and is disabled after success", async () => {
    await renderExpiredRefundScenario();
    fireEvent.click(screen.getByRole("button", { name: /^Refund:/i }));

    await screen.findByText("Refund successful!");

    // The modal opens and the background becomes aria-hidden; query with
    // hidden:true to confirm the button state regardless of focus trap.
    const refundBtn = screen.getByRole("button", {
      name: /^Refunded:/i,
      hidden: true,
    });
    expect(refundBtn).toBeDisabled();
  });

  test("refund does not open the claim-type modal", async () => {
    await renderExpiredRefundScenario();
    fireEvent.click(screen.getByRole("button", { name: /^Refund:/i }));

    await screen.findByText("Refund successful!");
    expect(
      screen.queryByText(/claim the token directly/i)
    ).not.toBeInTheDocument();
  });

  test("shows error when mint rejects refund (wallet.receive throws)", async () => {
    MockCashuWallet.mockImplementation(() =>
      makeMockWallet({
        checkProofsStates: jest.fn().mockResolvedValue([]),
        receive: jest
          .fn()
          .mockRejectedValue(new Error("Locktime not yet expired")),
        createMeltQuoteBolt11: jest.fn(),
      })
    );

    await renderExpiredRefundScenario();
    fireEvent.click(screen.getByRole("button", { name: /^Refund:/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Invalid Token/i })
      ).toBeInTheDocument()
    );
  });

  test("blocks refund when the mint does not advertise P2PK support", async () => {
    mockCheckMintP2pkSupport.mockResolvedValue({
      supported: false,
      reason: "Unsupported P2PK mint",
    });

    await renderExpiredRefundScenario();
    fireEvent.click(screen.getByRole("button", { name: /^Refund:/i }));

    const walletInstance = MockCashuWallet.mock.results[0]!.value;
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Invalid Token/i })
      ).toBeInTheDocument()
    );
    expect(mockCheckMintP2pkSupport).toHaveBeenCalledWith(
      "https://testmint.com"
    );
    expect(walletInstance.receive).not.toHaveBeenCalled();
  });

  test("non-P2PK tokens do not show a Refund button", async () => {
    mockParseP2PKProofSet.mockReturnValue({ p2pk: null });
    mockGetDecodedToken.mockReturnValue({
      mint: "https://testmint.com",
      proofs: [mockProof],
    });
    renderClaimButton();
    await screen.findByRole("button", { name: /^Claim:/i });
    expect(
      screen.queryByRole("button", { name: /^Refund:/i })
    ).not.toBeInTheDocument();
  });
});
