import React from "react";
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
import { getDecodedToken, Wallet as CashuWallet } from "@cashu/cashu-ts";
import {
  getLocalStorageData,
  publishProofEvent,
  publishWalletEvent,
  generateKeys,
} from "@/utils/nostr/nostr-helper-functions";
import { parseP2PK } from "@/utils/cashu/p2pk-checkout";
import { safeSwap } from "@/utils/cashu/swap-retry-service";
import { safeMeltProofs } from "@/utils/cashu/melt-retry-service";

jest.setTimeout(15000);

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  getLocalStorageData: jest.fn(),
  publishProofEvent: jest.fn(),
  publishWalletEvent: jest.fn(),
  generateKeys: jest.fn(),
  constructGiftWrappedEvent: jest.fn(),
  constructMessageSeal: jest.fn(),
  constructMessageGiftWrap: jest.fn(),
  sendGiftWrappedMessageEvent: jest.fn(),
}));

jest.mock("@cashu/cashu-ts", () => ({
  ...jest.requireActual("@cashu/cashu-ts"),
  getDecodedToken: jest.fn(),
  getEncodedToken: jest.fn().mockReturnValue("cashuAtoken"),
  Mint: jest.fn().mockImplementation(() => ({})),
  Wallet: jest.fn().mockImplementation(() => ({
    loadMint: jest.fn().mockResolvedValue(undefined),
    checkProofsStates: jest.fn().mockResolvedValue([]),
    receive: jest.fn().mockResolvedValue([]),
    createMeltQuoteBolt11: jest.fn(),
  })),
}));

jest.mock("@/utils/cashu/p2pk-checkout", () => ({
  parseP2PK: jest.fn().mockReturnValue(null),
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
const mockPublishProofEvent = publishProofEvent as jest.Mock;
const mockPublishWalletEvent = publishWalletEvent as jest.Mock;
const mockGenerateKeys = generateKeys as jest.Mock;
const mockParseP2PK = parseP2PK as jest.Mock;
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
  mockGenerateKeys.mockResolvedValue({
    nsec: "nsec1test",
    npub: "npub1test",
  });
  // Default: plain token, no P2PK
  mockGetDecodedToken.mockReturnValue({
    mint: "https://testmint.com",
    proofs: [mockProof],
  });
  mockParseP2PK.mockReturnValue(null);
  MockCashuWallet.mockImplementation(() => ({
    loadMint: jest.fn().mockResolvedValue(undefined),
    checkProofsStates: jest
      .fn()
      .mockResolvedValue([{ state: "UNSPENT", Y: "Y1" }]),
    receive: jest.fn().mockResolvedValue([mockFreshProof]),
    createMeltQuoteBolt11: jest.fn().mockResolvedValue({
      amount: { toNumber: () => 95 },
      fee_reserve: { toNumber: () => 3 },
    }),
  }));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ClaimButton — non-P2PK token (regression)", () => {
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
    const walletInstance = MockCashuWallet.mock.results[0].value;
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
    mockParseP2PK.mockReturnValue(mockParsedP2PK);

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

    const walletInstance = MockCashuWallet.mock.results[0].value;
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
    mockParseP2PK.mockReturnValue(mockParsedP2PK);
    MockCashuWallet.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkProofsStates: jest
        .fn()
        .mockResolvedValue([{ state: "UNSPENT", Y: "Y1" }]),
      receive: jest.fn().mockResolvedValue([mockFreshProof]),
      createMeltQuoteBolt11: jest.fn(),
    }));
  });

  test("calls wallet.loadMint() before wallet.receive()", async () => {
    renderClaimButton();

    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Receive$/i }));

    const walletInstance = MockCashuWallet.mock.results[0].value;
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

    const walletInstance = MockCashuWallet.mock.results[0].value;
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
    MockCashuWallet.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkProofsStates: jest.fn().mockResolvedValue([]),
      receive: jest.fn().mockRejectedValue(new Error("Mint rejected proof")),
      createMeltQuoteBolt11: jest.fn(),
    }));

    renderClaimButton();

    fireEvent.click(await screen.findByRole("button", { name: /Claim/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Receive$/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Invalid Token/i })
      ).toBeInTheDocument()
    );
  });
});

describe("ClaimButton — P2PK redeem path", () => {
  beforeEach(() => {
    mockGetDecodedToken.mockReturnValue({
      mint: "https://testmint.com",
      proofs: [mockP2PKProof],
    });
    mockParseP2PK.mockReturnValue(mockParsedP2PK);
    MockCashuWallet.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkProofsStates: jest
        .fn()
        .mockResolvedValue([{ state: "UNSPENT", Y: "Y1" }]),
      receive: jest.fn().mockResolvedValue([mockFreshProof]),
      createMeltQuoteBolt11: jest.fn().mockResolvedValue({
        amount: { toNumber: () => 95 },
        fee_reserve: { toNumber: () => 3 },
      }),
    }));
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

    const walletInstance = MockCashuWallet.mock.results[0].value;
    await waitFor(() => expect(walletInstance.receive).toHaveBeenCalled());

    const [, config] = walletInstance.receive.mock.calls[0];
    expect(config.privkey).toBe(CASHU_PRIVKEY);
    // safeSwap must NOT be called since we went through receive() not redeem()
    expect(mockSafeSwap).not.toHaveBeenCalled();
  });
});
