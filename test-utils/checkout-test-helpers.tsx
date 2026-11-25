import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import type { ProductData } from "@/utils/parsers/product-parser-functions";
import type { ShopProfile } from "@/utils/types/types";
import type { ListingPricingResult } from "@/utils/payments/listing-pricing";
import {
  SignerContext,
  NostrContext,
  NWCContext,
} from "@/components/utility-components/nostr-context-provider";
import {
  ProductContext,
  ShopMapContext,
  ReviewsContext,
  ProfileMapContext,
  ChatsContext,
  CashuWalletContext,
} from "@/utils/context/context";

// ── Fixtures ──────────────────────────────────────────────────────────────────

export function makeProductData(
  overrides: Partial<ProductData> = {}
): ProductData {
  return {
    id: "prod1",
    pubkey: "seller_pubkey",
    createdAt: 0,
    title: "Test Item",
    summary: "A test item.",
    publishedAt: "",
    images: ["img.jpg"],
    categories: [],
    location: "Online",
    price: 500,
    priceStatus: "known",
    currency: "SATS",
    shippingType: "Free",
    totalCost: 500,
    status: "active",
    ...overrides,
  };
}

export function makeShopProfile(
  overrides: Partial<ShopProfile> = {}
): ShopProfile {
  return {
    pubkey: "seller_pubkey",
    created_at: 0,
    ...overrides,
    content: {
      name: "Test Shop",
      about: "",
      ui: { picture: "", banner: "", theme: "", darkMode: false },
      merchants: [],
      ...(overrides.content ?? {}),
    },
  };
}

export interface MintQuoteFixtureOverrides {
  request?: string;
  quote?: string;
  amount?: number;
  mintUrl?: string;
  pricing?: Partial<ListingPricingResult>;
}

export function makeMintQuoteResponse(
  overrides: MintQuoteFixtureOverrides = {}
) {
  const amount = overrides.amount ?? 500;

  return {
    request: overrides.request ?? "lnbc5000n1mockinvoice",
    quote: overrides.quote ?? "quote_id_123",
    amount,
    mintUrl: overrides.mintUrl ?? "https://mint.example.com",
    pricing: {
      unitPrice: amount,
      subtotal: amount,
      shippingCost: 0,
      total: amount,
      currency: "SATS",
      ...overrides.pricing,
    } as ListingPricingResult,
  };
}

// ── Fetch mocking ─────────────────────────────────────────────────────────────

export function installFetchMock(): jest.Mock {
  const fetchMock = jest.fn();
  (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  return fetchMock;
}

export function mockFetchJsonOnce(
  body: unknown,
  init: { ok?: boolean; status?: number } = {}
): void {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  });
}

// ── Context default values ───────────────────────────────────────────────────

export function defaultSignerContextValue(
  overrides: Record<string, unknown> = {}
) {
  return {
    signer: {},
    isLoggedIn: true,
    isAuthStateResolved: true,
    pubkey: "buyer_pubkey",
    npub: "npub1buyer",
    newSigner: jest.fn(),
    ...overrides,
  };
}

export function defaultNostrContextValue(
  overrides: Record<string, unknown> = {}
) {
  return { nostr: {}, setNostr: jest.fn(), ...overrides };
}

export function defaultNWCContextValue(
  overrides: Record<string, unknown> = {}
) {
  return {
    nwcString: null,
    legacyNWCString: null,
    nwcInfo: null,
    hasStoredConnection: false,
    hasLegacyConnection: false,
    isUnlocked: false,
    saveConnection: jest.fn(),
    ensureUnlocked: jest
      .fn()
      .mockRejectedValue(new Error("NWC connection not found.")),
    lockConnection: jest.fn(),
    removeConnection: jest.fn(),
    ...overrides,
  };
}

export function connectedNWCContextValue(
  overrides: Record<string, unknown> = {}
) {
  return defaultNWCContextValue({
    nwcInfo: { alias: "MyWallet" },
    hasStoredConnection: true,
    ensureUnlocked: jest.fn().mockResolvedValue("nostr+walletconnect://mock"),
    ...overrides,
  });
}

export function defaultChatsContextValue(
  overrides: Record<string, unknown> = {}
) {
  return {
    chatsMap: new Map(),
    isLoading: false,
    addNewlyCreatedMessageEvent: jest.fn(),
    markAllMessagesAsRead: jest.fn().mockResolvedValue([]),
    newOrderIds: new Set<string>(),
    ...overrides,
  };
}

export function defaultProfileMapContextValue(
  overrides: Record<string, unknown> = {}
) {
  return {
    profileData: new Map(),
    isLoading: false,
    updateProfileData: jest.fn(),
    ...overrides,
  };
}

export function defaultCashuWalletContextValue(
  overrides: Record<string, unknown> = {}
) {
  return {
    proofEvents: [],
    cashuMints: [],
    cashuProofs: [],
    isLoading: false,
    cashuPubkey: undefined,
    cashuPrivkey: undefined,
    walletIdentityUnavailable: false,
    setProofEvents: jest.fn(),
    ...overrides,
  };
}

export function defaultProductContextValue(
  overrides: Record<string, unknown> = {}
) {
  return {
    productEvents: [],
    isLoading: false,
    addNewlyCreatedProductEvent: jest.fn(),
    removeDeletedProductEvent: jest.fn(),
    ...overrides,
  };
}

export function defaultShopMapContextValue(
  overrides: Record<string, unknown> = {}
) {
  return {
    shopData: new Map(),
    isLoading: false,
    updateShopData: jest.fn(),
    ...overrides,
  };
}

export function defaultReviewsContextValue(
  overrides: Record<string, unknown> = {}
) {
  return {
    merchantReviewsData: new Map(),
    productReviewsData: new Map(),
    isLoading: false,
    updateMerchantReviewsData: jest.fn(),
    updateProductReviewsData: jest.fn(),
    ...overrides,
  };
}

// ── Render helper ─────────────────────────────────────────────────────────────

export interface CheckoutContextOverrides {
  signer?: Record<string, unknown>;
  nostr?: Record<string, unknown>;
  nwc?: Record<string, unknown>;
  chats?: Record<string, unknown>;
  profileMap?: Record<string, unknown>;
  cashuWallet?: Record<string, unknown>;
  product?: Record<string, unknown>;
  shopMap?: Record<string, unknown>;
  reviews?: Record<string, unknown>;
}

export function renderWithCheckoutContext(
  ui: ReactElement,
  overrides: CheckoutContextOverrides = {}
) {
  return render(
    <SignerContext.Provider
      value={defaultSignerContextValue(overrides.signer) as any}
    >
      <NostrContext.Provider
        value={defaultNostrContextValue(overrides.nostr) as any}
      >
        <NWCContext.Provider
          value={defaultNWCContextValue(overrides.nwc) as any}
        >
          <ChatsContext.Provider
            value={defaultChatsContextValue(overrides.chats) as any}
          >
            <ProfileMapContext.Provider
              value={defaultProfileMapContextValue(overrides.profileMap) as any}
            >
              <CashuWalletContext.Provider
                value={
                  defaultCashuWalletContextValue(overrides.cashuWallet) as any
                }
              >
                <ProductContext.Provider
                  value={defaultProductContextValue(overrides.product) as any}
                >
                  <ShopMapContext.Provider
                    value={defaultShopMapContextValue(overrides.shopMap) as any}
                  >
                    <ReviewsContext.Provider
                      value={
                        defaultReviewsContextValue(overrides.reviews) as any
                      }
                    >
                      {ui}
                    </ReviewsContext.Provider>
                  </ShopMapContext.Provider>
                </ProductContext.Provider>
              </CashuWalletContext.Provider>
            </ProfileMapContext.Provider>
          </ChatsContext.Provider>
        </NWCContext.Provider>
      </NostrContext.Provider>
    </SignerContext.Provider>
  );
}

// ── Module mock factories ────────────────────────────────────────────────────

export function mockQrCodeModule() {
  return {
    __esModule: true,
    default: {
      toDataURL: jest.fn().mockResolvedValue("data:image/png;base64,mock"),
    },
  };
}

export function mockGetAlbySdkModule() {
  return {
    NostrWebLNProvider: jest.fn().mockImplementation(() => ({
      enable: jest.fn().mockResolvedValue(undefined),
      sendPayment: jest.fn().mockResolvedValue({ preimage: "mock_preimage" }),
      close: jest.fn(),
    })),
  };
}

export function mockGetAlbyLightningToolsModule() {
  return {
    getSatoshiValue: jest.fn().mockResolvedValue(500),
    LightningAddress: jest.fn().mockImplementation(() => ({
      fetch: jest.fn().mockResolvedValue(undefined),
      requestInvoice: jest
        .fn()
        .mockResolvedValue({ paymentRequest: "lnbc5000n1mockinvoice" }),
    })),
  };
}

export function mockCashuTsModule() {
  return {
    Mint: jest.fn().mockImplementation(() => ({})),
    Wallet: jest.fn().mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      createMeltQuoteBolt11: jest.fn(),
      createMintQuoteBolt11: jest.fn(),
      checkMintQuoteBolt11: jest.fn(),
      checkMeltQuoteBolt11: jest
        .fn()
        .mockResolvedValue({ state: "UNPAID", change: [] }),
      mintProofsBolt11: jest.fn(),
      meltProofsBolt11: jest.fn(),
      send: jest.fn(),
      receive: jest.fn(),
      keyChain: { getKeysets: jest.fn().mockResolvedValue([]) },
    })),
    getEncodedToken: jest.fn().mockReturnValue("cashuAmocktoken"),
    getDecodedToken: jest.fn(),
  };
}

export function mockMeltRetryServiceModule() {
  return { safeMeltProofs: jest.fn() };
}

export function mockSwapRetryServiceModule() {
  return { safeSwap: jest.fn() };
}

export function mockMintRetryServiceModule() {
  return {
    withMintRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
  };
}

export function mockP2pkCheckoutModule(
  overrides: Record<string, unknown> = {}
) {
  return {
    isP2pkEscrowFeatureEnabled: jest.fn().mockReturnValue(false),
    isP2pkMintAllowed: jest.fn().mockReturnValue(true),
    isSellerP2pkEscrowActive: jest.fn().mockReturnValue(false),
    resolveSellerCheckoutProfile: jest.fn().mockResolvedValue(null),
    resolveP2pkCheckoutOutputConfig: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

export function mockNostrHelperFunctionsModule(
  overrides: Record<string, unknown> = {}
) {
  return {
    getLocalStorageData: jest.fn().mockReturnValue({
      mints: ["https://mint.example.com"],
      tokens: [],
      history: [],
    }),
    publishProofEvent: jest.fn().mockResolvedValue(undefined),
    getSavedAddresses: jest.fn().mockReturnValue([]),
    ...overrides,
  };
}

export function mockGiftWrapModule(overrides: Record<string, unknown> = {}) {
  return {
    constructGiftWrappedEvent: jest
      .fn()
      .mockImplementation(
        async (
          sender: unknown,
          receiver: unknown,
          message: unknown,
          subject: unknown,
          options: Record<string, unknown> = {}
        ) => {
          const tags = [
            ["p", String(receiver)],
            ["subject", String(subject)],
          ];
          if (options.address) tags.push(["address", String(options.address)]);
          if (options.pickup) tags.push(["pickup", String(options.pickup)]);

          return {
            id: "mock-message-event-id",
            pubkey: String(sender),
            created_at: 0,
            content: String(message),
            kind: typeof options.kind === "number" ? options.kind : 14,
            tags,
          };
        }
      ),
    constructMessageSeal: jest
      .fn()
      .mockImplementation(async (_signer: unknown, event: unknown) => ({
        ...(event as Record<string, unknown>),
        id: "mock-seal-event-id",
        kind: 13,
        tags: [],
      })),
    constructMessageGiftWrap: jest
      .fn()
      .mockImplementation(
        async (
          event: unknown,
          randomPubkey: unknown,
          _randomPrivkey: unknown,
          recipientPubkey: unknown
        ) => ({
          id: "mock-gift-wrap-event-id",
          pubkey: String(randomPubkey),
          created_at: 0,
          content: JSON.stringify(event),
          kind: 1059,
          tags: [["p", String(recipientPubkey)]],
        })
      ),
    sendGiftWrappedMessageEvent: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function mockNextRouterModule(overrides: Record<string, unknown> = {}) {
  return {
    useRouter: () => ({ push: jest.fn(), query: {}, ...overrides }),
  };
}
