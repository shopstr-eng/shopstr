import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";

import CartInvoiceCard from "../cart-invoice-card";
import {
  makeProductData,
  renderWithCheckoutContext,
  installFetchMock,
  mockFetchJsonOnce,
  connectedNWCContextValue,
  type CheckoutContextOverrides,
} from "@/test-utils/checkout-test-helpers";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";
import { getSatoshiValue } from "@getalby/lightning-tools";
import {
  Mint as CashuMintCtor,
  Wallet as CashuWalletCtor,
} from "@cashu/cashu-ts";
import { safeSwap } from "@/utils/cashu/swap-retry-service";
import { safeMeltProofs } from "@/utils/cashu/melt-retry-service";
import { resolveSellerCheckoutProfile } from "@/utils/cashu/p2pk-checkout";
import { constructGiftWrappedEvent } from "@/utils/nostr/gift-wrap";
import { recoverProofsToBuyerWallet } from "@/utils/cashu/wallet-recovery";
import { NostrWebLNProvider } from "@getalby/sdk";
import type { ProductData } from "@/utils/parsers/product-parser-functions";
import type { ProductTotalsInSats } from "@/utils/cart-totals";

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("nostr-tools", () => ({
  nip19: {
    decode: jest.fn().mockReturnValue({ type: "npub", data: "mock_decoded" }),
    npubEncode: jest.fn().mockReturnValue("npub1mockencoded"),
  },
}));

jest.mock("@heroui/react", () => {
  const React = require("react");

  const Input = ({
    label,
    value,
    onChange,
    onBlur,
    isInvalid,
    errorMessage,
    disabled,
    "aria-label": ariaLabel,
  }: any) => {
    const id = React.useId();
    return (
      <div>
        {ariaLabel ? null : <label htmlFor={id}>{label}</label>}
        <input
          id={ariaLabel ? undefined : id}
          aria-label={ariaLabel}
          value={value ?? ""}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
        />
        {isInvalid && errorMessage ? (
          <span role="alert">{errorMessage}</span>
        ) : null}
      </div>
    );
  };

  const Select = ({ label, onChange, children, value, isRequired }: any) => {
    const id = React.useId();
    return (
      <div>
        <label htmlFor={id}>{label}</label>
        <select
          id={id}
          value={value ?? ""}
          onChange={onChange}
          required={isRequired}
        >
          <option value="" />
          {children}
        </select>
      </div>
    );
  };

  const SelectItem = ({ children }: any) =>
    React.createElement("option", { value: children }, children);

  const Checkbox = ({ isSelected, onValueChange, children }: any) =>
    React.createElement(
      "label",
      null,
      React.createElement("input", {
        type: "checkbox",
        checked: !!isSelected,
        onChange: (e: any) => onValueChange?.(e.target.checked),
      }),
      children
    );

  return {
    Button: ({ children, onClick, isDisabled, disabled, isLoading }: any) =>
      React.createElement(
        "button",
        {
          type: "button",
          onClick,
          disabled: isDisabled ?? disabled,
          "data-loading": isLoading ? "true" : undefined,
        },
        children
      ),
    Image: ({ src, alt }: any) => React.createElement("img", { src, alt }),
    useDisclosure: () => {
      const [isOpen, setIsOpen] = React.useState(false);
      return {
        isOpen,
        onOpen: () => setIsOpen(true),
        onClose: () => setIsOpen(false),
      };
    },
    Select,
    SelectItem,
    Input,
    Checkbox,
    Card: ({ children }: any) => React.createElement("div", null, children),
    CardHeader: ({ children }: any) =>
      React.createElement("div", null, children),
    CardBody: ({ children }: any) => React.createElement("div", null, children),
    Divider: () => React.createElement("hr"),
  };
});

jest.mock("@heroicons/react/24/outline", () => ({
  BanknotesIcon: () => null,
  BoltIcon: () => null,
  CheckIcon: () => null,
  ClipboardIcon: () => null,
  WalletIcon: () => null,
}));

jest.mock("@getalby/lightning-tools", () =>
  require("@/test-utils/checkout-test-helpers").mockGetAlbyLightningToolsModule()
);

jest.mock("@cashu/cashu-ts", () =>
  require("@/test-utils/checkout-test-helpers").mockCashuTsModule()
);

jest.mock("@/utils/cashu/melt-retry-service", () =>
  require("@/test-utils/checkout-test-helpers").mockMeltRetryServiceModule()
);

jest.mock("@/utils/cashu/swap-retry-service", () =>
  require("@/test-utils/checkout-test-helpers").mockSwapRetryServiceModule()
);

jest.mock("@/utils/cashu/p2pk-checkout", () =>
  require("@/test-utils/checkout-test-helpers").mockP2pkCheckoutModule()
);

jest.mock("@/utils/cashu/mint-retry-service", () =>
  require("@/test-utils/checkout-test-helpers").mockMintRetryServiceModule()
);

jest.mock("@/utils/cashu/pending-mint-operations", () => ({
  recordPendingMintQuote: jest.fn(),
  markMintQuoteClaimed: jest.fn(),
  updatePendingMintQuote: jest.fn(),
  getPendingMintQuotes: jest.fn().mockReturnValue([]),
  removePendingMintQuote: jest.fn(),
}));

jest.mock("@/utils/cashu/wallet-recovery", () => ({
  recoverProofsToBuyerWallet: jest.fn().mockResolvedValue(undefined),
  withDeadline: jest.fn((fn: () => Promise<unknown>) => fn()),
  isTimeoutError: jest.fn().mockReturnValue(false),
}));

jest.mock("@/utils/cashu/p2pk-escrow-records", () => ({
  createBuyerP2pkEscrowRecord: jest.fn().mockReturnValue({}),
  persistBuyerP2pkEscrowRecord: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/utils/nostr/key-utilities", () => ({
  generateKeys: jest
    .fn()
    .mockResolvedValue({ nsec: "nsec1mock", npub: "npub1mock" }),
}));

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  ...require("@/test-utils/checkout-test-helpers").mockNostrHelperFunctionsModule(),
  saveAddress: jest.fn(),
}));

jest.mock("@/utils/nostr/gift-wrap", () =>
  require("@/test-utils/checkout-test-helpers").mockGiftWrapModule()
);

jest.mock("qrcode", () =>
  require("@/test-utils/checkout-test-helpers").mockQrCodeModule()
);

jest.mock("@getalby/sdk", () =>
  require("@/test-utils/checkout-test-helpers").mockGetAlbySdkModule()
);

jest.mock("@/components/sign-in/SignInModal", () => ({
  __esModule: true,
  default: ({ isOpen }: any) =>
    isOpen ? <div data-testid="sign-in-modal" /> : null,
}));

jest.mock("@/components/utility-components/failure-modal", () => ({
  __esModule: true,
  default: ({ bodyText, isOpen }: any) =>
    isOpen ? <div role="alert">{bodyText}</div> : null,
}));

jest.mock("@/components/utility-components/dropdowns/country-dropdown", () => ({
  __esModule: true,
  default: ({ "aria-label": ariaLabel, value, onChange }: any) => (
    <input aria-label={ariaLabel} value={value ?? ""} onChange={onChange} />
  ),
}));

jest.mock("@/components/utility-components/address-picker", () => ({
  __esModule: true,
  default: () => null,
}));

// ── Typed mock handles ────────────────────────────────────────────────────────

const mockGetLocalStorageData = getLocalStorageData as jest.Mock;
const mockGetSatoshiValue = getSatoshiValue as jest.Mock;
const mockCashuWalletCtor = CashuWalletCtor as unknown as jest.Mock;
const mockCashuMintCtor = CashuMintCtor as unknown as jest.Mock;
const mockSafeSwap = safeSwap as jest.Mock;
const mockSafeMeltProofs = safeMeltProofs as jest.Mock;
const mockResolveSellerCheckoutProfile =
  resolveSellerCheckoutProfile as jest.Mock;
const mockConstructGiftWrappedEvent = constructGiftWrappedEvent as jest.Mock;
const mockRecoverProofsToBuyerWallet = recoverProofsToBuyerWallet as jest.Mock;
const mockNostrWebLNProvider = NostrWebLNProvider as unknown as jest.Mock;

// ── Fixtures & render helper ─────────────────────────────────────────────────

const BUYER_PUBKEY = "buyer_pubkey";

const DEFAULT_LOCAL_STORAGE_DATA = {
  mints: ["https://mint.example.com"],
  tokens: [] as { id: string; amount: number; secret: string }[],
  history: [] as unknown[],
};

function makeCartProduct(
  overrides: Partial<Omit<ProductData, "shippingType">> & {
    shippingType?: string;
  } = {}
) {
  return makeProductData({
    shippingType: "N/A",
    price: 1000,
    totalCost: 1000,
    ...overrides,
  } as Partial<ProductData>);
}

interface RenderCartOptions {
  quantities?: Record<string, number>;
  shippingTypes?: Record<string, string>;
  appliedDiscounts?: Record<string, number>;
  discountCodes?: Record<string, string>;
  onBackToCart?: () => void;
}

function renderCartInvoiceCard(
  products: ProductData[],
  options: RenderCartOptions = {},
  contextOverrides: CheckoutContextOverrides = {}
) {
  const quantities =
    options.quantities ?? Object.fromEntries(products.map((p) => [p.id, 1]));
  const shippingTypes =
    options.shippingTypes ??
    Object.fromEntries(products.map((p) => [p.id, p.shippingType || "N/A"]));
  const productTotalsInSats: ProductTotalsInSats = Object.fromEntries(
    products.map((p) => [p.id, (p.price ?? 0) * (quantities[p.id] || 1)])
  );
  const subtotalCost = Object.values(productTotalsInSats).reduce(
    (a, b) => a + b,
    0
  );

  const setInvoiceIsPaid = jest.fn();
  const setInvoiceGenerationFailed = jest.fn();
  const setCashuPaymentSent = jest.fn();
  const setCashuPaymentFailed = jest.fn();
  const onBackToCart = options.onBackToCart ?? jest.fn();

  const rendered = renderWithCheckoutContext(
    <CartInvoiceCard
      products={products}
      quantities={quantities}
      shippingTypes={shippingTypes}
      productTotalsInSats={productTotalsInSats}
      subtotalCost={subtotalCost}
      appliedDiscounts={options.appliedDiscounts}
      discountCodes={options.discountCodes}
      onBackToCart={onBackToCart}
      setInvoiceIsPaid={setInvoiceIsPaid}
      setInvoiceGenerationFailed={setInvoiceGenerationFailed}
      setCashuPaymentSent={setCashuPaymentSent}
      setCashuPaymentFailed={setCashuPaymentFailed}
    />,
    {
      signer: { pubkey: BUYER_PUBKEY, isLoggedIn: true, signer: {} },
      ...contextOverrides,
    }
  );

  return {
    products,
    quantities,
    shippingTypes,
    productTotalsInSats,
    subtotalCost,
    setInvoiceIsPaid,
    setInvoiceGenerationFailed,
    setCashuPaymentSent,
    setCashuPaymentFailed,
    onBackToCart,
    ...rendered,
  };
}

function makeDigitalCart() {
  return [
    makeCartProduct({ id: "prod-a", pubkey: "seller_a", price: 1000 }),
    makeCartProduct({ id: "prod-b", pubkey: "seller_b", price: 500 }),
  ];
}

function fillShippingForm(
  values: Partial<{
    Name: string;
    Address: string;
    City: string;
    "Postal Code": string;
    "State/Province": string;
    Country: string;
  }>
) {
  Object.entries(values).forEach(([label, value]) => {
    const accessibleName =
      label === "Country" ? /^Select Country$/i : new RegExp(`^${label}`, "i");
    fireEvent.change(screen.getByRole("textbox", { name: accessibleName }), {
      target: { value },
    });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  installFetchMock();
  sessionStorage.clear();
  mockGetLocalStorageData.mockReturnValue({ ...DEFAULT_LOCAL_STORAGE_DATA });
  mockGetSatoshiValue.mockResolvedValue(500);
  mockCashuWalletCtor.mockImplementation(() => ({
    loadMint: jest.fn().mockResolvedValue(undefined),
    checkMintQuoteBolt11: jest.fn().mockResolvedValue({ state: "UNPAID" }),
    mintProofsBolt11: jest.fn().mockResolvedValue([]),
    createMeltQuoteBolt11: jest.fn().mockResolvedValue({
      amount: 100,
      fee_reserve: 5,
    }),
    keyChain: { getKeysets: jest.fn().mockResolvedValue([]) },
  }));
  mockCashuMintCtor.mockImplementation(() => ({}));
  mockSafeSwap.mockResolvedValue({
    status: "swapped",
    keep: [],
    send: [{ id: "ks1", amount: 2, secret: "mockSend" }],
  });
  mockSafeMeltProofs.mockResolvedValue({
    status: "paid",
    meltQuote: { amount: 100 },
    changeProofs: [],
  });
  mockResolveSellerCheckoutProfile.mockResolvedValue(null);
  mockRecoverProofsToBuyerWallet.mockResolvedValue(undefined);
  mockNostrWebLNProvider.mockImplementation(() => ({
    enable: jest.fn().mockResolvedValue(undefined),
    sendPayment: jest.fn().mockResolvedValue({ preimage: "mock" }),
    close: jest.fn(),
  }));
  delete (window as any).webln;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("order-type button visibility (uniqueShippingTypes branching)", () => {
  it("shows only a single 'Mixed delivery' button when the cart has multiple distinct shippingTypes", () => {
    renderCartInvoiceCard([
      makeCartProduct({ id: "prod-a", shippingType: "Free/Pickup" }),
      makeCartProduct({ id: "prod-b", shippingType: "Added Cost/Pickup" }),
    ]);

    expect(
      screen.getByRole("button", { name: /^Mixed delivery/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Free shipping/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Pickup/ })
    ).not.toBeInTheDocument();
  });

  it("reveals the free-pickup preference sub-screen after choosing 'Mixed delivery' when the mix includes a pickup-capable type", () => {
    renderCartInvoiceCard([
      makeCartProduct({ id: "prod-a", shippingType: "Free/Pickup" }),
      makeCartProduct({ id: "prod-b", shippingType: "Added Cost/Pickup" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: /^Mixed delivery/ }));

    expect(
      screen.getByText("Shipping/Pickup Products Preference")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Free shipping/ })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pickup/ })).toBeInTheDocument();
  });

  it("shows only a shipping button when every item's shippingType is the single type 'Added Cost'", () => {
    renderCartInvoiceCard([
      makeCartProduct({ id: "prod-a", shippingType: "Added Cost" }),
      makeCartProduct({ id: "prod-b", shippingType: "Added Cost" }),
    ]);

    expect(
      screen.getByRole("button", { name: /^Online order with shipping/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Mixed delivery/ })
    ).not.toBeInTheDocument();
  });

  it("shows shipping and pickup buttons directly when every item shares the single type 'Free/Pickup'", () => {
    renderCartInvoiceCard([
      makeCartProduct({ id: "prod-a", shippingType: "Free/Pickup" }),
      makeCartProduct({ id: "prod-b", shippingType: "Free/Pickup" }),
    ]);

    expect(
      screen.getByRole("button", { name: /^Free shipping/ })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pickup/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Mixed delivery/ })
    ).not.toBeInTheDocument();
  });
});

describe("handleOrderTypeSelection", () => {
  it("'shipping' applies shipping-adjusted totals via buildShippingAdjustedProductTotals/getCartShippingPredicate", async () => {
    renderCartInvoiceCard([
      makeCartProduct({
        id: "prod-a",
        shippingType: "Added Cost",
        price: 1000,
        shippingCost: 100,
        currency: "SATS",
      }),
      makeCartProduct({
        id: "prod-b",
        shippingType: "Added Cost",
        price: 500,
        shippingCost: 50,
        currency: "SATS",
      }),
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: /^Online order with shipping/ })
    );

    const totalRow = await screen.findByText("Total:");
    await waitFor(() =>
      expect(
        within(totalRow.closest("div")!).getByText("1,650 sats")
      ).toBeInTheDocument()
    );
  });

  it("'contact' sets isFormValid true and resets totals to the no-shipping subtotal", async () => {
    renderCartInvoiceCard([
      makeCartProduct({
        id: "prod-a",
        shippingType: "Free/Pickup",
        price: 1000,
        shippingCost: 100,
        currency: "SATS",
      }),
      makeCartProduct({
        id: "prod-b",
        shippingType: "Free/Pickup",
        price: 500,
        shippingCost: 50,
        currency: "SATS",
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: /^Pickup/ }));

    const totalRow = screen.getByText("Total:").closest("div")!;
    expect(within(totalRow).getByText("1,500 sats")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Pay with Lightning/ })
    ).toBeEnabled();
  });

  it("'combined' prices immediately when there's no mixed shipping/pickup, else defers to the pickup-preference sub-screen", async () => {
    renderCartInvoiceCard([
      makeCartProduct({
        id: "prod-a",
        shippingType: "Added Cost",
        price: 1000,
        shippingCost: 100,
        currency: "SATS",
      }),
      makeCartProduct({
        id: "prod-b",
        shippingType: "Free",
        price: 500,
        shippingCost: 50,
        currency: "SATS",
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: /^Mixed delivery/ }));

    expect(
      screen.queryByText("Shipping/Pickup Products Preference")
    ).not.toBeInTheDocument();
    const totalRow = await screen.findByText("Total:");
    await waitFor(() =>
      expect(
        within(totalRow.closest("div")!).getByText("1,650 sats")
      ).toBeInTheDocument()
    );
  });
});

describe("buildShippingCostsInSats / convertShippingToSats", () => {
  it("converts each non-sats-currency product's shippingCost to sats via getSatoshiValue, without converting sats-currency products", async () => {
    renderCartInvoiceCard([
      makeCartProduct({
        id: "prod-a",
        shippingType: "Added Cost",
        shippingCost: 10,
        currency: "USD",
      }),
      makeCartProduct({
        id: "prod-b",
        shippingType: "Added Cost",
        shippingCost: 5,
        currency: "EUR",
      }),
      makeCartProduct({
        id: "prod-c",
        shippingType: "Added Cost",
        shippingCost: 100,
        currency: "SATS",
      }),
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: /^Online order with shipping/ })
    );

    await waitFor(() => expect(mockGetSatoshiValue).toHaveBeenCalledTimes(2));
    expect(mockGetSatoshiValue).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10, currency: "USD" })
    );
    expect(mockGetSatoshiValue).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5, currency: "EUR" })
    );
  });

  it("rolls back to the previous totals via handleShippingConversionError when an FX lookup fails", async () => {
    renderCartInvoiceCard([
      makeCartProduct({
        id: "prod-a",
        shippingType: "Added Cost",
        price: 1000,
        shippingCost: 10,
        currency: "USD",
      }),
    ]);
    mockGetSatoshiValue.mockRejectedValueOnce(new Error("FX lookup down"));

    fireEvent.click(
      screen.getByRole("button", { name: /^Online order with shipping/ })
    );

    expect(
      await screen.findByText(/Could not look up the current USD/)
    ).toBeInTheDocument();
    const totalRow = screen.getByText("Total:").closest("div")!;
    expect(within(totalRow).getByText("1,000 sats")).toBeInTheDocument();
  });
});

interface CartQuoteFixtureOverrides {
  request?: string;
  quote?: string;
  amount?: number;
  mintUrl?: string;
  breakdown?: Record<string, number>;
}

function makeCartQuoteResponse(
  products: ProductData[],
  overrides: CartQuoteFixtureOverrides = {}
) {
  const breakdown =
    overrides.breakdown ??
    Object.fromEntries(products.map((p) => [p.id, p.price ?? 0]));
  const amount =
    overrides.amount ??
    Object.values(breakdown).reduce((a, b) => (a ?? 0) + (b ?? 0), 0);
  return {
    request: overrides.request ?? "lnbc5000n1mockinvoice",
    quote: overrides.quote ?? "quote_id_123",
    amount,
    mintUrl: overrides.mintUrl ?? "https://mint.example.com",
    breakdown,
  };
}

describe("discount display (seller-keyed)", () => {
  it("reads appliedDiscounts/discountCodes by product.pubkey (seller), not product id", () => {
    renderCartInvoiceCard(makeDigitalCart(), {
      appliedDiscounts: { seller_a: 20 },
      discountCodes: { seller_a: "SAVE20" },
    });

    expect(screen.getByText(/SAVE20 \(20%\):/)).toBeInTheDocument();
    expect(screen.getAllByText("Discounted price:")).toHaveLength(1);
  });

  it("forwards discountCodes verbatim into requestCartQuote's body for server re-validation", async () => {
    const products = makeDigitalCart();
    renderCartInvoiceCard(products, {
      appliedDiscounts: { seller_a: 20 },
      discountCodes: { seller_a: "SAVE20" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    mockFetchJsonOnce(makeCartQuoteResponse(products));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(requestInit.body);
    expect(body.discountCodes).toEqual({ seller_a: "SAVE20" });
  });
});

describe("onFormSubmit — payment dispatch", () => {
  function renderDigitalReadyToPay(
    extraLocalStorage: Partial<typeof DEFAULT_LOCAL_STORAGE_DATA> = {},
    contextOverrides: CheckoutContextOverrides = {}
  ) {
    mockGetLocalStorageData.mockReturnValue({
      ...DEFAULT_LOCAL_STORAGE_DATA,
      ...extraLocalStorage,
    });
    const rendered = renderCartInvoiceCard(
      makeDigitalCart(),
      {},
      contextOverrides
    );
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    return rendered;
  }

  it("dispatches to handleLightningPayment for any other/undefined paymentType", async () => {
    const { products } = renderDigitalReadyToPay();
    mockFetchJsonOnce(makeCartQuoteResponse(products));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    expect(await screen.findByText("Lightning Invoice")).toBeInTheDocument();
    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(requestInit.body).priceOnly).toBe(false);
  });

  it("dispatches to handleCashuPayment when paymentType is 'cashu'", async () => {
    const { products } = renderDigitalReadyToPay({
      tokens: [{ id: "ks1", amount: 1000, secret: "s1" }],
    });
    mockFetchJsonOnce(makeCartQuoteResponse(products));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(requestInit.body).priceOnly).toBe(true);
    expect(screen.queryByText("Lightning Invoice")).not.toBeInTheDocument();
    expect(mockNostrWebLNProvider).not.toHaveBeenCalled();
  });

  it("dispatches to handleNWCPayment when paymentType is 'nwc'", async () => {
    const { products } = renderDigitalReadyToPay(
      {},
      {
        nwc: connectedNWCContextValue(),
      }
    );
    mockFetchJsonOnce(makeCartQuoteResponse(products));

    fireEvent.click(screen.getByRole("button", { name: /Pay with MyWallet/ }));

    await waitFor(() => expect(mockNostrWebLNProvider).toHaveBeenCalled());
  });

  it("blocks submission when totalCost < 1 sat", async () => {
    const zeroPriceProduct = makeCartProduct({
      id: "prod-free",
      pubkey: "seller_free",
      price: 0,
      totalCost: 0,
    });
    renderCartInvoiceCard([zeroPriceProduct]);
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    expect(
      await screen.findByText("Payment failed. Please try again.")
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("requestCartQuote / applyServerPricing", () => {
  function renderDigitalReadyToPay() {
    mockGetLocalStorageData.mockReturnValue({ ...DEFAULT_LOCAL_STORAGE_DATA });
    const rendered = renderCartInvoiceCard(makeDigitalCart());
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    return rendered;
  }

  it("applies the server-computed per-item breakdown to currentProductTotalsInSats/totalCost", async () => {
    const { products } = renderDigitalReadyToPay();
    mockFetchJsonOnce(
      makeCartQuoteResponse(products, {
        breakdown: { "prod-a": 900, "prod-b": 450 },
      })
    );
    // Stall right after applyServerPricing runs so the assertion below is
    // deterministic (no need to drive the whole polling loop to completion).
    mockCashuWalletCtor.mockImplementation(() => ({
      loadMint: () => new Promise(() => {}),
      checkMintQuoteBolt11: jest.fn(),
      mintProofsBolt11: jest.fn(),
      keyChain: { getKeysets: jest.fn() },
    }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    const totalRow = await screen.findByText("Total:");
    await waitFor(() =>
      expect(
        within(totalRow.closest("div")!).getByText("1,350 sats")
      ).toBeInTheDocument()
    );
  });

  it("rejects a server total outside tolerance (max(2, ceil(totalCost*0.01)))", async () => {
    const products = makeDigitalCart();
    renderCartInvoiceCard(
      products,
      {},
      {
        nwc: connectedNWCContextValue(),
      }
    );
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    mockFetchJsonOnce(
      makeCartQuoteResponse(products, {
        breakdown: { "prod-a": 5000, "prod-b": 5000 },
        amount: 10000,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: /Pay with MyWallet/ }));

    expect(await screen.findByText(/verified cart total/)).toBeInTheDocument();
  });
});

describe("invoiceHasBeenPaid polling", () => {
  function renderDigitalReadyToPay() {
    mockGetLocalStorageData.mockReturnValue({ ...DEFAULT_LOCAL_STORAGE_DATA });
    const rendered = renderCartInvoiceCard(makeDigitalCart());
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    return rendered;
  }

  it("calls setInvoiceIsPaid(true) once the quote reports PAID", async () => {
    const { products, setInvoiceIsPaid } = renderDigitalReadyToPay();
    mockFetchJsonOnce(makeCartQuoteResponse(products));
    mockCashuWalletCtor.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkMintQuoteBolt11: jest.fn().mockResolvedValue({ state: "PAID" }),
      mintProofsBolt11: jest
        .fn()
        .mockResolvedValue([{ id: "ks1", amount: 1500, secret: "s1" }]),
      keyChain: { getKeysets: jest.fn().mockResolvedValue([]) },
    }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    await waitFor(() => expect(setInvoiceIsPaid).toHaveBeenCalledWith(true), {
      timeout: 8000,
    });
  }, 10000);

  it("retries on UNPAID up to maxRetries=30 (differs from product-invoice-card's 42) with the documented 2100ms delay", async () => {
    jest.useFakeTimers();
    try {
      const { products } = renderDigitalReadyToPay();
      mockFetchJsonOnce(makeCartQuoteResponse(products));
      mockCashuWalletCtor.mockImplementation(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkMintQuoteBolt11: jest.fn().mockResolvedValue({ state: "UNPAID" }),
        mintProofsBolt11: jest.fn(),
        keyChain: { getKeysets: jest.fn() },
      }));

      fireEvent.click(
        screen.getByRole("button", { name: /Pay with Lightning/ })
      );

      await jest.advanceTimersByTimeAsync(0);
      const wallet = mockCashuWalletCtor.mock.results[0]!.value;
      expect(wallet.checkMintQuoteBolt11).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(2100 * 29);
      expect(wallet.checkMintQuoteBolt11).toHaveBeenCalledTimes(30);

      // maxRetries reached — loop exits without further polling.
      await jest.advanceTimersByTimeAsync(2100 * 5);
      expect(wallet.checkMintQuoteBolt11).toHaveBeenCalledTimes(30);
    } finally {
      jest.useRealTimers();
    }
  }, 15000);

  it("[regression] waits and counts retries when checkMintQuoteBolt11 returns an unknown state", async () => {
    jest.useFakeTimers();
    try {
      const { products } = renderDigitalReadyToPay();
      mockFetchJsonOnce(makeCartQuoteResponse(products));
      const checkMintQuoteBolt11 = jest
        .fn()
        .mockResolvedValue({ state: "WEIRD" });
      mockCashuWalletCtor.mockImplementation(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkMintQuoteBolt11,
        mintProofsBolt11: jest.fn(),
        keyChain: { getKeysets: jest.fn().mockResolvedValue([]) },
      }));

      fireEvent.click(
        screen.getByRole("button", { name: /Pay with Lightning/ })
      );

      await jest.advanceTimersByTimeAsync(0);
      expect(checkMintQuoteBolt11).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(2100);
      expect(checkMintQuoteBolt11).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(2100 * 28);
      expect(checkMintQuoteBolt11).toHaveBeenCalledTimes(30);

      await jest.advanceTimersByTimeAsync(2100 * 5);
      expect(checkMintQuoteBolt11).toHaveBeenCalledTimes(30);
    } finally {
      jest.useRealTimers();
    }
  }, 15000);
});

describe("sendTokens — per-product loop", () => {
  function renderDigitalReadyToPay() {
    mockGetLocalStorageData.mockReturnValue({ ...DEFAULT_LOCAL_STORAGE_DATA });
    const rendered = renderCartInvoiceCard(makeDigitalCart());
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    return rendered;
  }

  function stubPaidWallet() {
    mockCashuWalletCtor.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkMintQuoteBolt11: jest.fn().mockResolvedValue({ state: "PAID" }),
      mintProofsBolt11: jest
        .fn()
        .mockResolvedValue([{ id: "ks1", amount: 1500, secret: "s1" }]),
      keyChain: { getKeysets: jest.fn().mockResolvedValue([]) },
    }));
  }

  it("calls safeSwap once per product in the cart (products loop individually, sellers are not consolidated)", async () => {
    const { products, setInvoiceIsPaid } = renderDigitalReadyToPay();
    mockFetchJsonOnce(makeCartQuoteResponse(products));
    // No donation swap, to keep the per-product safeSwap count exactly 1:1.
    mockResolveSellerCheckoutProfile.mockResolvedValue({
      content: { shopstr_donation: 0 },
    });
    stubPaidWallet();

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    await waitFor(() => expect(setInvoiceIsPaid).toHaveBeenCalledWith(true), {
      timeout: 8000,
    });
    expect(mockSafeSwap).toHaveBeenCalledTimes(2);
  }, 10000);

  it("passes the complete cart payment contract to the Nostr sending layer", async () => {
    const coffee = makeCartProduct({
      id: "coffee",
      pubkey: "seller_coffee",
      title: "Coffee Beans",
      price: 1000,
      shippingType: "Free/Pickup",
      pickupLocations: ["Warehouse Counter"],
      selectedWeight: "1kg",
      selectedBulkOption: 3,
    });
    const download = makeCartProduct({
      id: "download",
      pubkey: "seller_download",
      title: "Digital Guide",
      price: 500,
      shippingType: "N/A",
    });
    const products = [coffee, download];
    mockGetLocalStorageData.mockReturnValue({
      ...DEFAULT_LOCAL_STORAGE_DATA,
      tokens: [{ id: "ks1", amount: 3500, secret: "s1" }],
    });
    const { setCashuPaymentSent } = renderCartInvoiceCard(products, {
      quantities: { coffee: 3, download: 1 },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Mixed delivery/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Pickup/ }));
    fireEvent.change(screen.getByLabelText(/Coffee Beans - Pickup Location/i), {
      target: { value: "Warehouse Counter" },
    });
    fillShippingForm({
      Name: "Grace Hopper",
      Address: "456 Oak Ave",
      City: "Arlington",
      "Postal Code": "22201",
      "State/Province": "VA",
      Country: "USA",
    });
    mockFetchJsonOnce(
      makeCartQuoteResponse(products, {
        amount: 3500,
        breakdown: { coffee: 3000, download: 500 },
      })
    );

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    await waitFor(
      () => expect(setCashuPaymentSent).toHaveBeenCalledWith(true),
      { timeout: 9000 }
    );
    const paymentCall = mockConstructGiftWrappedEvent.mock.calls.find(
      ([, recipient, , subject, options]) =>
        recipient === "seller_coffee" &&
        subject === "order-payment" &&
        options?.productData?.id === "coffee"
    );

    expect(paymentCall).toBeDefined();
    expect(paymentCall![2]).toBe(
      "This is a Cashu token payment from npub1buyer for 3 of your Coffee Beans listing in 1kg (bulk: 3 units) (pickup at: Warehouse Counter) on Shopstr: cashuAmocktoken"
    );
    expect(paymentCall![4]).toEqual(
      expect.objectContaining({
        isOrder: true,
        type: 2,
        orderAmount: 2937,
        productData: expect.objectContaining({
          id: "coffee",
          pubkey: "seller_coffee",
          title: "Coffee Beans",
        }),
        quantity: 3,
        paymentType: "ecash",
        paymentReference: "cashuAmocktoken",
        address: "Grace Hopper, 456 Oak Ave, Arlington, VA, 22201, USA",
        pickup: "Warehouse Counter",
        donationAmount: 63,
        donationPercentage: 2.1,
      })
    );
  }, 12000);

  it("a failure partway through the per-product loop does not undo an already-completed product's payout, even though the overall checkout still fails", async () => {
    const { products, setInvoiceIsPaid } = renderDigitalReadyToPay();
    mockFetchJsonOnce(makeCartQuoteResponse(products));
    mockResolveSellerCheckoutProfile.mockResolvedValue({
      content: { shopstr_donation: 0 },
    });
    mockSafeSwap
      .mockResolvedValueOnce({
        status: "swapped",
        keep: [],
        send: [{ id: "ks1", amount: 998, secret: "sellerA" }],
      })
      .mockRejectedValueOnce(new Error("swap failed for seller B"));
    stubPaidWallet();

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    await waitFor(() =>
      expect(mockRecoverProofsToBuyerWallet).toHaveBeenCalled()
    );
    expect(setInvoiceIsPaid).not.toHaveBeenCalledWith(true);
    const sentForProductA = mockConstructGiftWrappedEvent.mock.calls.some(
      ([, , , subject, options]: any) =>
        subject === "order-payment" && options?.productData?.id === "prod-a"
    );
    expect(sentForProductA).toBe(true);
  }, 10000);
});

describe("cart clearing on success (localStorage['cart'])", () => {
  function renderDigitalReadyToPay() {
    mockGetLocalStorageData.mockReturnValue({ ...DEFAULT_LOCAL_STORAGE_DATA });
    const rendered = renderCartInvoiceCard(makeDigitalCart());
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    return rendered;
  }

  it("clears the cart in localStorage after a successful Lightning payment", async () => {
    const setItemSpy = jest.spyOn(Storage.prototype, "setItem");
    const { products, setInvoiceIsPaid } = renderDigitalReadyToPay();
    mockFetchJsonOnce(makeCartQuoteResponse(products));
    mockCashuWalletCtor.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkMintQuoteBolt11: jest.fn().mockResolvedValue({ state: "PAID" }),
      mintProofsBolt11: jest
        .fn()
        .mockResolvedValue([{ id: "ks1", amount: 1500, secret: "s1" }]),
      keyChain: { getKeysets: jest.fn().mockResolvedValue([]) },
    }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    await waitFor(() => expect(setInvoiceIsPaid).toHaveBeenCalledWith(true), {
      timeout: 8000,
    });
    expect(setItemSpy).toHaveBeenCalledWith("cart", "[]");
  }, 10000);

  it("clears the cart in localStorage after a successful Cashu payment", async () => {
    const setItemSpy = jest.spyOn(Storage.prototype, "setItem");
    mockGetLocalStorageData.mockReturnValue({
      ...DEFAULT_LOCAL_STORAGE_DATA,
      tokens: [{ id: "ks1", amount: 1500, secret: "s1" }],
    });
    const products = makeDigitalCart();
    const { setCashuPaymentSent } = renderCartInvoiceCard(products);
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    mockFetchJsonOnce(makeCartQuoteResponse(products));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    await waitFor(
      () => expect(setCashuPaymentSent).toHaveBeenCalledWith(true),
      { timeout: 9000 }
    );
    expect(setItemSpy).toHaveBeenCalledWith("cart", "[]");
  }, 10000);

  it("does NOT clear the cart when onFormSubmit's catch fires (payment failed)", async () => {
    const setItemSpy = jest.spyOn(Storage.prototype, "setItem");
    const zeroPriceProduct = makeCartProduct({
      id: "prod-free",
      pubkey: "seller_free",
      price: 0,
      totalCost: 0,
    });
    renderCartInvoiceCard([zeroPriceProduct]);
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    await screen.findByText("Payment failed. Please try again.");
    expect(setItemSpy).not.toHaveBeenCalledWith("cart", expect.anything());
  });
});

describe("dual success UI states — paymentConfirmed vs orderConfirmed", () => {
  it("Lightning success sets paymentConfirmed and renders the 'Payment confirmed!' block inside the QR view", async () => {
    mockGetLocalStorageData.mockReturnValue({ ...DEFAULT_LOCAL_STORAGE_DATA });
    const products = makeDigitalCart();
    renderCartInvoiceCard(products);
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    mockFetchJsonOnce(makeCartQuoteResponse(products));
    mockCashuWalletCtor.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkMintQuoteBolt11: jest.fn().mockResolvedValue({ state: "PAID" }),
      mintProofsBolt11: jest
        .fn()
        .mockResolvedValue([{ id: "ks1", amount: 1500, secret: "s1" }]),
      keyChain: { getKeysets: jest.fn().mockResolvedValue([]) },
    }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    expect(
      await screen.findByText("Payment confirmed!", {}, { timeout: 9000 })
    ).toBeInTheDocument();
    expect(screen.queryByText("Order confirmed!")).not.toBeInTheDocument();
  }, 10000);

  it("Cashu success sets orderConfirmed (not the QR view) and renders the separate 'Order confirmed!' block outside the QR view", async () => {
    mockGetLocalStorageData.mockReturnValue({
      ...DEFAULT_LOCAL_STORAGE_DATA,
      tokens: [{ id: "ks1", amount: 1500, secret: "s1" }],
    });
    const products = makeDigitalCart();
    renderCartInvoiceCard(products);
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    mockFetchJsonOnce(makeCartQuoteResponse(products));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    expect(
      await screen.findByText("Order confirmed!", {}, { timeout: 9000 })
    ).toBeInTheDocument();
    expect(screen.queryByText("Payment confirmed!")).not.toBeInTheDocument();
    expect(screen.queryByText("Lightning Invoice")).not.toBeInTheDocument();
  }, 10000);
});

describe("onFormSubmit catch", () => {
  it("shows a generic 'Payment failed. Please try again.' FailureModal (less specific than product-invoice-card's message-preserving catch)", async () => {
    const zeroPriceProduct = makeCartProduct({
      id: "prod-free",
      pubkey: "seller_free",
      price: 0,
      totalCost: 0,
    });
    renderCartInvoiceCard([zeroPriceProduct]);
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    expect(
      await screen.findByText("Payment failed. Please try again.")
    ).toBeInTheDocument();

    expect(
      screen.queryByText(/Total price is less than 1 sat/)
    ).not.toBeInTheDocument();
  });
});

describe("failure callbacks (handleLightningPayment/handleCashuPayment catches)", () => {
  it("calls setInvoiceGenerationFailed(true) on Lightning payment failure, without showing FailureModal", async () => {
    mockGetLocalStorageData.mockReturnValue({ ...DEFAULT_LOCAL_STORAGE_DATA });
    const { setInvoiceGenerationFailed } =
      renderCartInvoiceCard(makeDigitalCart());
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error("network down")
    );

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    await waitFor(() =>
      expect(setInvoiceGenerationFailed).toHaveBeenCalledWith(true)
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls setCashuPaymentFailed(true) on Cashu payment failure, without showing FailureModal", async () => {
    mockGetLocalStorageData.mockReturnValue({
      ...DEFAULT_LOCAL_STORAGE_DATA,
      tokens: [{ id: "ks1", amount: 1000, secret: "s1" }],
    });
    const { setCashuPaymentFailed } = renderCartInvoiceCard(makeDigitalCart());
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error("network down")
    );

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    await waitFor(() =>
      expect(setCashuPaymentFailed).toHaveBeenCalledWith(true)
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
