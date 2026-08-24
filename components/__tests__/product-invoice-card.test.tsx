import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";

import ProductInvoiceCard from "../product-invoice-card";
import {
  makeProductData,
  renderWithCheckoutContext,
  installFetchMock,
  mockFetchJsonOnce,
  makeMintQuoteResponse,
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
import QRCode from "qrcode";
import type { ProductData } from "@/utils/parsers/product-parser-functions";

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

  const Select = ({
    label,
    onChange,
    children,
    selectedKeys,
    isRequired,
  }: any) => {
    const id = React.useId();
    return (
      <div>
        <label htmlFor={id}>{label}</label>
        <select
          id={id}
          value={selectedKeys?.[0] ?? ""}
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

jest.mock("@/utils/nostr/nostr-helper-functions", () =>
  require("@/test-utils/checkout-test-helpers").mockNostrHelperFunctionsModule()
);

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
const mockQrCodeToDataURL = (QRCode as unknown as { toDataURL: jest.Mock })
  .toDataURL;

// ── Fixtures & render helper ─────────────────────────────────────────────────

const BUYER_PUBKEY = "buyer_pubkey";
const SELLER_PUBKEY = "seller_pubkey";

const DEFAULT_LOCAL_STORAGE_DATA = {
  mints: ["https://mint.example.com"],
  tokens: [] as { id: string; amount: number; secret: string }[],
  history: [] as unknown[],
};

function renderProductInvoiceCard(
  overrides: Partial<ProductData> = {},
  props: Partial<{
    selectedSize: string;
    selectedVolume: string;
    selectedWeight: string;
    selectedBulkOption: number;
    discountCode: string;
    discountPercentage: number;
    originalPrice: number;
  }> = {},
  contextOverrides: CheckoutContextOverrides = {}
) {
  const productData = makeProductData({ pubkey: SELLER_PUBKEY, ...overrides });
  const setIsBeingPaid = jest.fn();
  const setInvoiceIsPaid = jest.fn();
  const setInvoiceGenerationFailed = jest.fn();
  const setCashuPaymentSent = jest.fn();
  const setCashuPaymentFailed = jest.fn();

  const rendered = renderWithCheckoutContext(
    <ProductInvoiceCard
      productData={productData}
      setIsBeingPaid={setIsBeingPaid}
      setInvoiceIsPaid={setInvoiceIsPaid}
      setInvoiceGenerationFailed={setInvoiceGenerationFailed}
      setCashuPaymentSent={setCashuPaymentSent}
      setCashuPaymentFailed={setCashuPaymentFailed}
      {...props}
    />,
    {
      signer: { pubkey: BUYER_PUBKEY, isLoggedIn: true, signer: {} },
      ...contextOverrides,
    }
  );

  return {
    productData,
    setIsBeingPaid,
    setInvoiceIsPaid,
    setInvoiceGenerationFailed,
    setCashuPaymentSent,
    setCashuPaymentFailed,
    ...rendered,
  };
}

/** Digital/no-shipping listing: clicking the single order-type button lands
 * directly on formType "contact" with isFormValid true immediately (no
 * pickup location required) — the cheapest path to an enabled Pay button. */
function makeDigitalProduct(overrides: Partial<ProductData> = {}) {
  return {
    price: 1000,
    currency: "SATS",
    totalCost: 1000,
    shippingType: "N/A" as const,
    ...overrides,
  };
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
    fireEvent.change(screen.getByLabelText(new RegExp(label, "i")), {
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

describe("supportsShipping / supportsPickup / requiresPickupLocation", () => {
  it("shows only the shipping order option for a shippingType of 'Added Cost' with no pickup locations", () => {
    renderProductInvoiceCard({
      shippingType: "Added Cost",
      shippingCost: 100,
    });

    expect(
      screen.getByRole("button", { name: /Online order with shipping/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Pickup/ })
    ).not.toBeInTheDocument();
  });

  it("shows only the pickup-location picker for a shippingType of 'Pickup' with pickupLocations present", () => {
    renderProductInvoiceCard({
      shippingType: "Pickup",
      pickupLocations: ["Downtown Store", "Uptown Store"],
    });

    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));

    expect(screen.getByText("Select Pickup Location")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Downtown Store" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Uptown Store" })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it("shows both order-type buttons when the listing supports both shipping and pickup", () => {
    renderProductInvoiceCard({
      shippingType: "Free/Pickup",
      shippingCost: 0,
    });

    expect(
      screen.getByRole("button", { name: /^Free shipping/ })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pickup/ })).toBeInTheDocument();
  });

  it("skips the address form entirely for a free-shipping/digital listing with no pickup locations", () => {
    renderProductInvoiceCard(makeDigitalProduct());

    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));

    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Address/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Pay with Lightning/ })
    ).toBeEnabled();
  });
});

describe("form validity (useEffect)", () => {
  it("isFormValid is false until all required shipping fields are non-empty (post-trim)", async () => {
    renderProductInvoiceCard({
      shippingType: "Added Cost",
      shippingCost: 100,
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Online order with shipping/i })
    );

    const payButton = screen.getByRole("button", {
      name: /Pay with Lightning/,
    });
    await waitFor(() => expect(payButton).toBeDisabled());

    fillShippingForm({
      Name: "Ada Lovelace",
      Address: "123 Main St",
      City: "Metropolis",
      "Postal Code": "12345",
      "State/Province": "  ",
      Country: "USA",
    });
    await waitFor(() => expect(payButton).toBeDisabled());

    fillShippingForm({ "State/Province": "NY" });
    await waitFor(() => expect(payButton).toBeEnabled());
  });

  it("isFormValid depends on selectedPickupLocation, not the shipping fields, when formType is 'contact' and requiresPickupLocation", async () => {
    renderProductInvoiceCard({
      shippingType: "Pickup",
      pickupLocations: ["Downtown Store"],
    });
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));

    const payButton = screen.getByRole("button", {
      name: /Pay with Lightning/,
    });
    await waitFor(() => expect(payButton).toBeDisabled());

    fireEvent.change(screen.getByLabelText("Pickup Location"), {
      target: { value: "Downtown Store" },
    });

    await waitFor(() => expect(payButton).toBeEnabled());
  });
});

describe("onFormSubmit — payment method dispatch", () => {
  function renderDigitalReadyToPay(
    extraLocalStorage: Partial<typeof DEFAULT_LOCAL_STORAGE_DATA> = {},
    contextOverrides: CheckoutContextOverrides = {}
  ) {
    mockGetLocalStorageData.mockReturnValue({
      ...DEFAULT_LOCAL_STORAGE_DATA,
      ...extraLocalStorage,
    });
    const rendered = renderProductInvoiceCard(
      makeDigitalProduct(),
      {},
      contextOverrides
    );
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    return rendered;
  }

  it("calls handleLightningPayment for any other/undefined paymentType", async () => {
    renderDigitalReadyToPay();
    mockFetchJsonOnce(makeMintQuoteResponse());

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    expect(
      await screen.findByRole("heading", { name: "Lightning Invoice" })
    ).toBeInTheDocument();
    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(requestInit.body).priceOnly).toBeUndefined();
  });

  it("calls handleCashuPayment when paymentType is 'cashu'", async () => {
    renderDigitalReadyToPay({
      tokens: [{ id: "ks1", amount: 1000, secret: "s1" }],
    });
    mockFetchJsonOnce(makeMintQuoteResponse());

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(requestInit.body).priceOnly).toBe(true);
    expect(
      screen.queryByRole("heading", { name: "Lightning Invoice" })
    ).not.toBeInTheDocument();
    expect(mockNostrWebLNProvider).not.toHaveBeenCalled();
  });

  it("calls handleNWCPayment when paymentType is 'nwc'", async () => {
    renderDigitalReadyToPay(
      {},
      {
        nwc: connectedNWCContextValue(),
      }
    );
    mockFetchJsonOnce(makeMintQuoteResponse());

    fireEvent.click(screen.getByRole("button", { name: /Pay with MyWallet/ }));

    await waitFor(() => expect(mockNostrWebLNProvider).toHaveBeenCalled());
  });

  it("converts a fiat-currency price to sats via getSatoshiValue before dispatch", async () => {
    mockGetLocalStorageData.mockReturnValue({ ...DEFAULT_LOCAL_STORAGE_DATA });
    renderProductInvoiceCard(makeDigitalProduct({ currency: "USD" }));
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    mockFetchJsonOnce(makeMintQuoteResponse());

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    await waitFor(() =>
      expect(mockGetSatoshiValue).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1000, currency: "USD" })
      )
    );
  });
});

describe("discount/total display (currentPrice/appliedDiscount)", () => {
  it("renders discountedTotal = discountedPrice + shippingCost only when formType is 'shipping'", () => {
    renderProductInvoiceCard(
      {
        shippingType: "Added Cost",
        shippingCost: 100,
        price: 500,
        totalCost: 500,
      },
      { originalPrice: 1000, discountPercentage: 20 }
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Online order with shipping/i })
    );

    const totalRow = screen.getByText("Total:").closest("div")!;
    expect(within(totalRow).getByText("900 SATS")).toBeInTheDocument();
  });

  it("renders discountedTotal without shippingCost when formType is 'contact' (pickup)", () => {
    renderProductInvoiceCard(
      {
        shippingType: "Free/Pickup",
        shippingCost: 100,
        price: 500,
        totalCost: 500,
      },
      { originalPrice: 1000, discountPercentage: 20 }
    );
    fireEvent.click(screen.getByRole("button", { name: /^Pickup/ }));

    const totalRow = screen.getByText("Total:").closest("div")!;
    expect(within(totalRow).getByText("800 SATS")).toBeInTheDocument();
  });

  it("uses the originalPrice prop over productData.price when both are present", () => {
    renderProductInvoiceCard(
      { price: 500, totalCost: 500 },
      { originalPrice: 1200 }
    );

    expect(screen.getByText("Product cost:").closest("div")).toHaveTextContent(
      "1,200 SATS"
    );
  });
});

describe("server-side repricing guard (validateQuoteMatchesSelectedListingOptions, assertServerAmountWithinTolerance)", () => {
  function renderNwcReady() {
    renderProductInvoiceCard(
      makeDigitalProduct({ price: 1000, totalCost: 1000 }),
      {},
      { nwc: connectedNWCContextValue() }
    );
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
  }

  it("accepts a server quote within tolerance (max(2, ceil(displayed*0.01)) sats) of the displayed total", async () => {
    renderNwcReady();
    mockFetchJsonOnce(makeMintQuoteResponse({ amount: 1002 }));
    mockNostrWebLNProvider.mockImplementation(() => ({
      enable: jest.fn().mockResolvedValue(undefined),
      sendPayment: jest
        .fn()
        .mockRejectedValue(new Error("STOP_AFTER_TOLERANCE_CHECK")),
      close: jest.fn(),
    }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with MyWallet/ }));

    expect(
      await screen.findByText(/STOP_AFTER_TOLERANCE_CHECK/)
    ).toBeInTheDocument();
  });

  it("rejects/flags a server quote whose amount exceeds tolerance of the displayed total", async () => {
    renderNwcReady();
    mockFetchJsonOnce(makeMintQuoteResponse({ amount: 2000 }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with MyWallet/ }));

    expect(await screen.findByText(/verified price/)).toBeInTheDocument();
  });

  it.each([
    ["size", { selectedSize: "M" }],
    ["volume", { selectedVolume: "1L" }],
    ["weight", { selectedWeight: "1kg" }],
    ["bulk option", { selectedBulkOption: 5 }],
  ])(
    "rejects a quote whose selected %s differs from the client",
    async (_, pricing) => {
      renderNwcReady();
      mockFetchJsonOnce(makeMintQuoteResponse({ pricing }));

      fireEvent.click(
        screen.getByRole("button", { name: /Pay with MyWallet/ })
      );

      expect(
        await screen.findByText(/did not match the selected listing options/)
      ).toBeInTheDocument();
    }
  );
});

describe("handleLightningPayment", () => {
  function renderLightningReadyToPay() {
    mockGetLocalStorageData.mockReturnValue({ ...DEFAULT_LOCAL_STORAGE_DATA });
    const rendered = renderProductInvoiceCard(makeDigitalProduct());
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    return rendered;
  }

  /** Freezes invoiceHasBeenPaid right after its first poll so a test can
   * assert pre-payment state (QR rendering, webln attempt) without needing
   * to drive the whole polling/hand-off chain to completion. */
  function stallAfterFirstPoll() {
    mockCashuWalletCtor.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkMintQuoteBolt11: jest.fn(() => new Promise(() => {})),
      mintProofsBolt11: jest.fn(),
      keyChain: { getKeysets: jest.fn() },
    }));
  }

  it("creates a mint quote and renders a QR code for the returned bolt11 invoice", async () => {
    renderLightningReadyToPay();
    stallAfterFirstPoll();
    mockFetchJsonOnce(makeMintQuoteResponse({ request: "lnbc_test_invoice" }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    const img = await screen.findByAltText("Lightning invoice");
    expect(img).toHaveAttribute("src", "data:image/png;base64,mock");
    expect(mockQrCodeToDataURL).toHaveBeenCalledWith("lnbc_test_invoice");
  });

  it("resets showInvoiceCard/invoice/qrCodeUrl and calls setInvoiceGenerationFailed(true) on quote-creation failure (no FailureModal shown here)", async () => {
    const { setInvoiceGenerationFailed } = renderLightningReadyToPay();
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error("network down")
    );

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    await waitFor(() =>
      expect(setInvoiceGenerationFailed).toHaveBeenCalledWith(true)
    );
    expect(
      screen.queryByRole("heading", { name: "Lightning Invoice" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("attempts window.webln auto-pay when available", async () => {
    renderLightningReadyToPay();
    stallAfterFirstPoll();
    mockFetchJsonOnce(makeMintQuoteResponse({ request: "lnbc_test_invoice" }));
    const sendPayment = jest.fn().mockResolvedValue(true);
    (window as any).webln = {
      enable: jest.fn().mockResolvedValue(undefined),
      isEnabled: jest.fn().mockResolvedValue(true),
      sendPayment,
    };

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    await waitFor(() =>
      expect(sendPayment).toHaveBeenCalledWith("lnbc_test_invoice")
    );
    expect(await screen.findByAltText("Lightning invoice")).toBeInTheDocument();
  });

  it("still shows the QR when window.webln is unavailable", async () => {
    renderLightningReadyToPay();
    stallAfterFirstPoll();
    mockFetchJsonOnce(makeMintQuoteResponse({ request: "lnbc_test_invoice" }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    expect(await screen.findByAltText("Lightning invoice")).toBeInTheDocument();
    expect(mockQrCodeToDataURL).toHaveBeenCalledWith("lnbc_test_invoice");
  });
});

describe("invoiceHasBeenPaid polling", () => {
  function renderLightningReadyToPay() {
    mockGetLocalStorageData.mockReturnValue({ ...DEFAULT_LOCAL_STORAGE_DATA });
    const rendered = renderProductInvoiceCard(makeDigitalProduct());
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    return rendered;
  }

  it("calls setInvoiceIsPaid(true) once checkMintQuoteBolt11 (wrapped in withMintRetry) reports PAID", async () => {
    const { setInvoiceIsPaid } = renderLightningReadyToPay();
    mockFetchJsonOnce(makeMintQuoteResponse());
    mockCashuWalletCtor.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkMintQuoteBolt11: jest.fn().mockResolvedValue({ state: "PAID" }),
      mintProofsBolt11: jest
        .fn()
        .mockResolvedValue([{ id: "ks1", amount: 1000, secret: "s1" }]),
      keyChain: { getKeysets: jest.fn().mockResolvedValue([]) },
    }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    await waitFor(() => expect(setInvoiceIsPaid).toHaveBeenCalledWith(true), {
      timeout: 8000,
    });
  }, 10000);

  it("retries on an unrecognized quote state up to maxRetries=42 with a 2100ms delay", async () => {
    jest.useFakeTimers();
    try {
      renderLightningReadyToPay();
      mockFetchJsonOnce(makeMintQuoteResponse());
      mockCashuWalletCtor.mockImplementation(() => ({
        loadMint: jest.fn().mockResolvedValue(undefined),
        checkMintQuoteBolt11: jest.fn().mockResolvedValue({ state: "WEIRD" }),
        mintProofsBolt11: jest.fn(),
        keyChain: { getKeysets: jest.fn() },
      }));

      fireEvent.click(
        screen.getByRole("button", { name: /Pay with Lightning/ })
      );

      await jest.advanceTimersByTimeAsync(0);
      const wallet = mockCashuWalletCtor.mock.results[0]!.value;
      expect(wallet.checkMintQuoteBolt11).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(2100 * 41);
      expect(wallet.checkMintQuoteBolt11).toHaveBeenCalledTimes(42);

      // maxRetries reached — loop exits without further polling.
      await jest.advanceTimersByTimeAsync(2100 * 5);
      expect(wallet.checkMintQuoteBolt11).toHaveBeenCalledTimes(42);
    } finally {
      jest.useRealTimers();
    }
  }, 15000);

  it("recovers proofs to the buyer wallet via recoverProofsToBuyerWallet when hand-off fails after PAID", async () => {
    renderLightningReadyToPay();
    mockFetchJsonOnce(makeMintQuoteResponse());
    mockResolveSellerCheckoutProfile.mockResolvedValueOnce({
      content: { shopstr_donation: 0 },
    });
    mockSafeSwap.mockRejectedValueOnce(new Error("swap failed"));
    mockCashuWalletCtor.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkMintQuoteBolt11: jest.fn().mockResolvedValue({ state: "PAID" }),
      mintProofsBolt11: jest
        .fn()
        .mockResolvedValue([{ id: "ks1", amount: 1000, secret: "s1" }]),
      keyChain: { getKeysets: jest.fn().mockResolvedValue([]) },
    }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    await waitFor(() =>
      expect(mockRecoverProofsToBuyerWallet).toHaveBeenCalled()
    );
    expect(
      await screen.findByText(/couldn't be delivered to the seller/)
    ).toBeInTheDocument();
  });
});

describe("handleCashuPayment", () => {
  function renderCashuReadyToPay(
    extraLocalStorage: Partial<typeof DEFAULT_LOCAL_STORAGE_DATA> = {}
  ) {
    mockGetLocalStorageData.mockReturnValue({
      ...DEFAULT_LOCAL_STORAGE_DATA,
      tokens: [{ id: "ks1", amount: 1000, secret: "s1" }],
      ...extraLocalStorage,
    });
    const rendered = renderProductInvoiceCard(makeDigitalProduct());
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    return rendered;
  }

  it("reprices server-side via requestListingPriceQuote before spending proofs", async () => {
    renderCashuReadyToPay();
    let resolveQuote!: (quote: unknown) => void;
    const parseQuote = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveQuote = resolve;
        })
    );
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: parseQuote,
    });

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    await waitFor(() => expect(parseQuote).toHaveBeenCalled());
    const [url, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("/api/listing/mint-quote");
    const body = JSON.parse(requestInit.body);
    expect(body.priceOnly).toBe(true);
    expect(body.productId).toBeDefined();
    expect(mockCashuWalletCtor).not.toHaveBeenCalled();
    expect(mockSafeSwap).not.toHaveBeenCalled();

    resolveQuote(makeMintQuoteResponse());

    await waitFor(() => expect(mockSafeSwap).toHaveBeenCalled());
  });

  it("does not construct a wallet or spend proofs when server repricing fails", async () => {
    const { setCashuPaymentFailed } = renderCashuReadyToPay();
    mockFetchJsonOnce({ error: "listing unavailable" }, { ok: false });

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    await waitFor(() =>
      expect(setCashuPaymentFailed).toHaveBeenCalledWith(true)
    );
    expect(mockCashuWalletCtor).not.toHaveBeenCalled();
    expect(mockSafeSwap).not.toHaveBeenCalled();
  });

  it.each([
    ["the amount exceeds tolerance", { amount: 2000 }],
    ["a selected option does not match", { pricing: { selectedSize: "M" } }],
  ])("does not spend proofs when %s", async (_, quoteOverrides) => {
    const { setCashuPaymentFailed } = renderCashuReadyToPay();
    mockFetchJsonOnce(makeMintQuoteResponse(quoteOverrides));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    await waitFor(() =>
      expect(setCashuPaymentFailed).toHaveBeenCalledWith(true)
    );
    expect(mockCashuWalletCtor).not.toHaveBeenCalled();
    expect(mockSafeSwap).not.toHaveBeenCalled();
  });

  it("calls setCashuPaymentFailed(true) (not FailureModal) when sendTokens/safeSwap rejects", async () => {
    const { setCashuPaymentFailed } = renderCashuReadyToPay();
    mockFetchJsonOnce(makeMintQuoteResponse());
    mockSafeSwap.mockRejectedValueOnce(new Error("swap failed"));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    await waitFor(() =>
      expect(setCashuPaymentFailed).toHaveBeenCalledWith(true)
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not clear/mutate the buyer's local wallet proofs when payment fails", async () => {
    const setItemSpy = jest.spyOn(Storage.prototype, "setItem");
    const { setCashuPaymentFailed } = renderCashuReadyToPay();
    mockFetchJsonOnce(makeMintQuoteResponse());
    mockSafeSwap.mockRejectedValueOnce(new Error("swap failed"));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    await waitFor(() =>
      expect(setCashuPaymentFailed).toHaveBeenCalledWith(true)
    );
    expect(setItemSpy).not.toHaveBeenCalledWith("tokens", expect.anything());
  });
});

describe("sendTokens — seller payout branches", () => {
  function renderCashuReadyToPay(overrides: Partial<ProductData> = {}) {
    mockGetLocalStorageData.mockReturnValue({
      ...DEFAULT_LOCAL_STORAGE_DATA,
      tokens: [{ id: "ks1", amount: 1000, secret: "s1" }],
    });
    const rendered = renderProductInvoiceCard(makeDigitalProduct(overrides));
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    return rendered;
  }

  it("routes to safeMeltProofs when the seller's payment_preference is 'lightning' and lud16 is present and not @zeuspay.com", async () => {
    renderCashuReadyToPay();
    mockFetchJsonOnce(makeMintQuoteResponse());
    mockResolveSellerCheckoutProfile.mockResolvedValueOnce({
      content: {
        payment_preference: "lightning",
        lud16: "seller@getalby.com",
        shopstr_donation: 0,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    await waitFor(() => expect(mockSafeMeltProofs).toHaveBeenCalled());
  });

  it.each([
    ["the seller prefers ecash", { payment_preference: "ecash" }],
    ["a Lightning address is missing", { payment_preference: "lightning" }],
    [
      "the Lightning address is hosted by ZeusPay",
      { payment_preference: "lightning", lud16: "seller@zeuspay.com" },
    ],
  ])("routes to ecash payout when %s", async (_, profileContent) => {
    const { setCashuPaymentSent } = renderCashuReadyToPay();
    mockFetchJsonOnce(makeMintQuoteResponse());
    mockResolveSellerCheckoutProfile.mockResolvedValueOnce({
      content: { ...profileContent, shopstr_donation: 0 },
    });

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    await waitFor(
      () => expect(setCashuPaymentSent).toHaveBeenCalledWith(true),
      {
        timeout: 5000,
      }
    );
    expect(mockSafeMeltProofs).not.toHaveBeenCalled();
    const sentEcashToSeller = mockConstructGiftWrappedEvent.mock.calls.some(
      ([, recipient, , subject, options]) =>
        recipient === SELLER_PUBKEY &&
        subject === "order-payment" &&
        options?.paymentType === "ecash" &&
        options?.paymentReference === "cashuAmocktoken"
    );
    expect(sentEcashToSeller).toBe(true);
  });

  it("passes the complete ecash payment contract to the Nostr sending layer", async () => {
    const { setCashuPaymentSent } = renderCashuReadyToPay();
    mockFetchJsonOnce(makeMintQuoteResponse({ amount: 1000 }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    await waitFor(
      () => expect(setCashuPaymentSent).toHaveBeenCalledWith(true),
      { timeout: 5000 }
    );
    const paymentCall = mockConstructGiftWrappedEvent.mock.calls.find(
      ([, recipient, , subject]) =>
        recipient === SELLER_PUBKEY && subject === "order-payment"
    );

    expect(paymentCall).toBeDefined();
    expect(paymentCall![2]).toBe(
      "This is a Cashu token payment from npub1buyer for your Test Item listing on Shopstr: cashuAmocktoken"
    );
    expect(paymentCall![4]).toEqual(
      expect.objectContaining({
        isOrder: true,
        type: 2,
        orderAmount: 979,
        productData: expect.objectContaining({
          id: "prod1",
          pubkey: SELLER_PUBKEY,
          title: "Test Item",
        }),
        quantity: 1,
        paymentType: "ecash",
        paymentReference: "cashuAmocktoken",
        donationAmount: 21,
        donationPercentage: 2.1,
      })
    );
  });

  it("includes shipping address details in the order event when formType is 'shipping'", async () => {
    mockGetLocalStorageData.mockReturnValue({
      ...DEFAULT_LOCAL_STORAGE_DATA,
      tokens: [{ id: "ks1", amount: 1000, secret: "s1" }],
    });
    const { setCashuPaymentSent } = renderProductInvoiceCard({
      shippingType: "Added Cost",
      shippingCost: 100,
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Online order with shipping/i })
    );
    fillShippingForm({
      Name: "Ada Lovelace",
      Address: "123 Main St",
      City: "Metropolis",
      "Postal Code": "12345",
      "State/Province": "NY",
      Country: "USA",
    });
    mockFetchJsonOnce(makeMintQuoteResponse());

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    await waitFor(
      () => expect(setCashuPaymentSent).toHaveBeenCalledWith(true),
      {
        timeout: 5000,
      }
    );
    const shippingCall = mockConstructGiftWrappedEvent.mock.calls.find(
      ([, recipient, , subject]) =>
        recipient === SELLER_PUBKEY && subject === "order-info"
    );

    expect(shippingCall).toBeDefined();
    expect(shippingCall![2]).toBe(
      "Please ship the product to Ada Lovelace at 123 Main St, Metropolis, NY, 12345, USA."
    );
    expect(shippingCall![4]).toEqual(
      expect.objectContaining({
        quantity: 1,
        address: "Ada Lovelace, 123 Main St, Metropolis, NY, 12345, USA",
        donationAmount: 11,
        donationPercentage: 2.1,
      })
    );
  });

  it("includes pickup and excludes shipping address when formType is 'contact'", async () => {
    mockGetLocalStorageData.mockReturnValue({
      ...DEFAULT_LOCAL_STORAGE_DATA,
      tokens: [{ id: "ks1", amount: 1000, secret: "s1" }],
    });
    const { setCashuPaymentSent } = renderProductInvoiceCard({
      shippingType: "Pickup",
      pickupLocations: ["Downtown Store"],
    });
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    fireEvent.change(screen.getByLabelText("Pickup Location"), {
      target: { value: "Downtown Store" },
    });
    mockFetchJsonOnce(makeMintQuoteResponse());

    fireEvent.click(screen.getByRole("button", { name: /Pay with Cashu/ }));

    await waitFor(
      () => expect(setCashuPaymentSent).toHaveBeenCalledWith(true),
      {
        timeout: 5000,
      }
    );
    const paymentCall = mockConstructGiftWrappedEvent.mock.calls.find(
      ([, recipient, , subject]) =>
        recipient === SELLER_PUBKEY && subject === "order-payment"
    );

    expect(paymentCall).toBeDefined();
    expect(paymentCall![2]).toBe(
      "This is a Cashu token payment from npub1buyer for your Test Item listing (pickup at: Downtown Store) on Shopstr: cashuAmocktoken"
    );
    expect(paymentCall![4]).toEqual(
      expect.objectContaining({
        quantity: 1,
        pickup: "Downtown Store",
        address: undefined,
        donationAmount: 11,
        donationPercentage: 2.1,
      })
    );
  });
});

describe("handleNWCPayment", () => {
  function renderNwcReadyToPay() {
    const rendered = renderProductInvoiceCard(
      makeDigitalProduct(),
      {},
      { nwc: connectedNWCContextValue() }
    );
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    return rendered;
  }

  it("pays via NostrWebLNProvider and calls setInvoiceIsPaid(true) on success", async () => {
    const { setInvoiceIsPaid } = renderNwcReadyToPay();
    mockFetchJsonOnce(makeMintQuoteResponse());
    mockCashuWalletCtor.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkMintQuoteBolt11: jest.fn().mockResolvedValue({ state: "PAID" }),
      mintProofsBolt11: jest
        .fn()
        .mockResolvedValue([{ id: "ks1", amount: 1000, secret: "s1" }]),
      keyChain: { getKeysets: jest.fn().mockResolvedValue([]) },
    }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with MyWallet/ }));

    await waitFor(() => expect(mockNostrWebLNProvider).toHaveBeenCalled());
    await waitFor(() => expect(setInvoiceIsPaid).toHaveBeenCalledWith(true), {
      timeout: 8000,
    });
  }, 10000);

  const nwcErrorCases: Array<[string, RegExp]> = [
    ["INSUFFICIENT_BALANCE", /insufficient balance/i],
    ["QUOTA_EXCEEDED", /spending quota/i],
    ["PAYMENT_FAILED", /check your wallet and try again/i],
    ["RATE_LIMITED", /too quickly/i],
  ];

  it.each(nwcErrorCases)(
    "maps %s to a distinct FailureModal message",
    async (code, expectedText) => {
      renderNwcReadyToPay();
      mockFetchJsonOnce(makeMintQuoteResponse());
      mockNostrWebLNProvider.mockImplementation(() => ({
        enable: jest.fn().mockResolvedValue(undefined),
        sendPayment: jest.fn().mockRejectedValue({ code }),
        close: jest.fn(),
      }));

      fireEvent.click(
        screen.getByRole("button", { name: /Pay with MyWallet/ })
      );

      expect(await screen.findByText(expectedText)).toBeInTheDocument();
    }
  );

  it("shows FailureModal directly for NWC failures (unlike Lightning/Cashu, which delegate to parent callbacks)", async () => {
    const { setInvoiceGenerationFailed, setCashuPaymentFailed } =
      renderNwcReadyToPay();
    mockFetchJsonOnce(makeMintQuoteResponse());
    mockNostrWebLNProvider.mockImplementation(() => ({
      enable: jest.fn().mockResolvedValue(undefined),
      sendPayment: jest.fn().mockRejectedValue(new Error("boom")),
      close: jest.fn(),
    }));

    fireEvent.click(screen.getByRole("button", { name: /Pay with MyWallet/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "NWC Error: boom"
    );
    expect(setInvoiceGenerationFailed).not.toHaveBeenCalled();
    expect(setCashuPaymentFailed).not.toHaveBeenCalled();
  });
});

describe("payment-confirmed session summary", () => {
  function renderLightningReadyToPay() {
    mockGetLocalStorageData.mockReturnValue({ ...DEFAULT_LOCAL_STORAGE_DATA });
    const rendered = renderProductInvoiceCard(makeDigitalProduct());
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    return rendered;
  }

  function stubPaidWallet() {
    mockCashuWalletCtor.mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      checkMintQuoteBolt11: jest.fn().mockResolvedValue({ state: "PAID" }),
      mintProofsBolt11: jest
        .fn()
        .mockResolvedValue([{ id: "ks1", amount: 1000, secret: "s1" }]),
      keyChain: { getKeysets: jest.fn().mockResolvedValue([]) },
    }));
  }

  it("persists an order summary to sessionStorage['orderSummary'] once paymentConfirmed becomes true", async () => {
    const { productData, setInvoiceIsPaid } = renderLightningReadyToPay();
    mockFetchJsonOnce(makeMintQuoteResponse());
    stubPaidWallet();

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    await waitFor(() => expect(setInvoiceIsPaid).toHaveBeenCalledWith(true), {
      timeout: 8000,
    });

    const summary = JSON.parse(sessionStorage.getItem("orderSummary")!);
    expect(summary.productTitle).toBe(productData.title);
    expect(summary.paymentMethod).toBe("lightning");
    expect(summary.orderId).toBeTruthy();
  }, 10000);

  it("sends the order/contact message via ChatsContext.addNewlyCreatedMessageEvent", async () => {
    mockGetLocalStorageData.mockReturnValue({ ...DEFAULT_LOCAL_STORAGE_DATA });
    const addNewlyCreatedMessageEvent = jest.fn();
    const { setInvoiceIsPaid } = renderProductInvoiceCard(
      makeDigitalProduct(),
      {},
      { chats: { addNewlyCreatedMessageEvent } }
    );
    fireEvent.click(screen.getByRole("button", { name: /Online order/i }));
    mockFetchJsonOnce(makeMintQuoteResponse());
    stubPaidWallet();

    fireEvent.click(screen.getByRole("button", { name: /Pay with Lightning/ }));

    await waitFor(() => expect(setInvoiceIsPaid).toHaveBeenCalledWith(true), {
      timeout: 8000,
    });
    expect(addNewlyCreatedMessageEvent).toHaveBeenCalled();
  }, 10000);
});
