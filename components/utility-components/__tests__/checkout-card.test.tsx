import { screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import CheckoutCard from "../checkout-card";
import {
  makeProductData,
  renderWithCheckoutContext,
  installFetchMock,
  mockFetchJsonOnce,
  type CheckoutContextOverrides,
} from "@/test-utils/checkout-test-helpers";
import { isP2pkEscrowFeatureEnabled } from "@/utils/cashu/p2pk-checkout";
import type { ProductData } from "@/utils/parsers/product-parser-functions";

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("@/utils/cashu/p2pk-checkout", () => ({
  isP2pkEscrowFeatureEnabled: jest.fn().mockReturnValue(false),
}));

jest.mock("next/router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock("nostr-tools", () => ({
  nip19: { decode: jest.fn(), encode: jest.fn(), npubEncode: jest.fn() },
  Event: {},
}));

jest.mock("@heroui/react", () => {
  const React = require("react");
  return {
    Button: ({ children, onClick, isDisabled, disabled }: any) =>
      React.createElement(
        "button",
        { onClick, disabled: isDisabled ?? disabled },
        children
      ),
    Chip: ({ children, startContent }: any) =>
      React.createElement(
        "div",
        { "data-testid": "chip" },
        startContent,
        children
      ),
    Input: ({
      label,
      value,
      onChange,
      disabled,
      isInvalid,
      errorMessage,
    }: any) =>
      React.createElement(
        "div",
        null,
        React.createElement("input", {
          "aria-label": label,
          value: value ?? "",
          onChange,
          disabled,
        }),
        isInvalid && errorMessage
          ? React.createElement("span", { role: "alert" }, errorMessage)
          : null
      ),
    useDisclosure: () => {
      const [isOpen, setIsOpen] = React.useState(false);
      return {
        isOpen,
        onOpen: () => setIsOpen(true),
        onClose: () => setIsOpen(false),
      };
    },
    Dropdown: ({ children }: any) => React.createElement("div", null, children),
    DropdownTrigger: ({ children }: any) =>
      React.createElement("div", null, children),
    DropdownMenu: ({ children }: any) =>
      React.createElement("div", null, children),
    DropdownItem: ({ children }: any) =>
      React.createElement("div", null, children),
  };
});

jest.mock("@heroicons/react/24/outline", () => ({
  FaceFrownIcon: () => null,
  FaceSmileIcon: () => null,
  ArrowLongDownIcon: () => null,
  ArrowLongUpIcon: () => null,
  EllipsisVerticalIcon: () => null,
}));

jest.mock("@/utils/parsers/product-parser-functions", () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue({}),
  ProductData: {},
}));

jest.mock("@/utils/url-slugs", () => ({
  getListingSlug: jest.fn().mockReturnValue("slug"),
}));

jest.mock("@/components/utility-components/profile/profile-dropdown", () => ({
  ProfileWithDropdown: () => null,
}));

const mockDisplayCheckoutCost = jest.fn((_props: any) => null);
jest.mock("@/components/utility-components/display-monetary-info", () => ({
  DisplayCheckoutCost: (props: any) => mockDisplayCheckoutCost(props),
}));

const mockProductInvoiceCard = jest.fn((_props: any) => null);
jest.mock("@/components/product-invoice-card", () => ({
  __esModule: true,
  default: (props: any) => mockProductInvoiceCard(props),
}));

jest.mock("@/components/free-shipping-notification", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/utility-components/failure-modal", () => ({
  __esModule: true,
  default: ({ bodyText, isOpen }: any) =>
    isOpen ? <div role="alert">{bodyText}</div> : null,
}));

jest.mock("@/components/utility-components/success-modal", () => ({
  __esModule: true,
  default: ({ bodyText, isOpen }: any) =>
    isOpen ? <div role="status">{bodyText}</div> : null,
}));

jest.mock("@/components/sign-in/SignInModal", () => ({
  __esModule: true,
  default: ({ isOpen }: any) =>
    isOpen ? <div data-testid="sign-in-modal" /> : null,
}));

jest.mock("@/components/utility-components/volume-selector", () => ({
  __esModule: true,
  default: ({ volumes, onVolumeChange }: any) => (
    <div>
      {volumes.map((volume: string) => (
        <button key={volume} onClick={() => onVolumeChange(volume)}>
          {volume}
        </button>
      ))}
    </div>
  ),
}));

jest.mock("@/components/utility-components/weight-selector", () => ({
  __esModule: true,
  default: ({ weights, onWeightChange }: any) => (
    <div>
      {weights.map((weight: string) => (
        <button key={weight} onClick={() => onWeightChange(weight)}>
          {weight}
        </button>
      ))}
    </div>
  ),
}));

jest.mock("@/components/utility-components/bulk-selector", () => ({
  __esModule: true,
  default: ({ bulkPrices, onBulkChange }: any) => (
    <div>
      {Array.from(bulkPrices.keys() as IterableIterator<number>).map(
        (units) => (
          <button key={units} onClick={() => onBulkChange(String(units))}>
            {`bulk-${units}`}
          </button>
        )
      )}
    </div>
  ),
}));

jest.mock("@/components/ZapsnagButton", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/utility-components/modals/event-modals", () => ({
  RawEventModal: () => null,
  EventIdModal: () => null,
}));

jest.mock("@/components/utility-components/use-report-event-flow", () => ({
  __esModule: true,
  default: jest
    .fn()
    .mockReturnValue({ openReportFlow: jest.fn(), reportFlowUi: null }),
}));

jest.mock(
  "@/components/utility-components/dropdowns/location-dropdown",
  () => ({
    locationAvatar: jest.fn().mockReturnValue(null),
  })
);

// ── Typed mock handles ────────────────────────────────────────────────────────

const mockIsP2pkEscrowFeatureEnabled = isP2pkEscrowFeatureEnabled as jest.Mock;

// ── Fixtures & render helper ─────────────────────────────────────────────────

const BUYER_PUBKEY = "buyer_pubkey";
const SELLER_PUBKEY = "seller_pubkey";

function renderCheckoutCard(
  overrides: Partial<ProductData> = {},
  contextOverrides: CheckoutContextOverrides = {}
) {
  const productData = makeProductData({ pubkey: SELLER_PUBKEY, ...overrides });
  const rendered = renderWithCheckoutContext(
    <CheckoutCard
      productData={productData}
      setInvoiceIsPaid={jest.fn()}
      setInvoiceGenerationFailed={jest.fn()}
      setCashuPaymentSent={jest.fn()}
      setCashuPaymentFailed={jest.fn()}
    />,
    {
      signer: { pubkey: BUYER_PUBKEY, isLoggedIn: true },
      ...contextOverrides,
    }
  );
  return { productData, ...rendered };
}

function makeVariantProduct(overrides: Partial<ProductData> = {}) {
  return {
    price: 1000,
    sizes: ["S", "M"],
    sizeQuantities: new Map([
      ["S", 3],
      ["M", 0],
    ]),
    volumes: ["500ml"],
    volumePrices: new Map([["500ml", 700]]),
    weights: ["1kg"],
    weightPrices: new Map([["1kg", 800]]),
    bulkPrices: new Map([[5, 2000]]),
    ...overrides,
  };
}

function latestCallProps(mockFn: jest.Mock) {
  return mockFn.mock.calls[mockFn.mock.calls.length - 1][0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsP2pkEscrowFeatureEnabled.mockReturnValue(false);
  installFetchMock();
  localStorage.clear();
  jest.spyOn(Storage.prototype, "setItem");
  delete (navigator as any).share;
  delete (navigator as any).clipboard;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("discount code — handleApplyDiscount / handleRemoveDiscount", () => {
  it("applies a valid discount code and reflects appliedDiscount/discountedTotal in the displayed price", async () => {
    const { productData } = renderCheckoutCard({
      price: 1000,
      shippingCost: 100,
      currency: "SATS",
    });

    fireEvent.change(screen.getByLabelText("Discount Code"), {
      target: { value: "save20" },
    });
    mockFetchJsonOnce({ valid: true, discount_percentage: 20 });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await screen.findByRole("button", { name: "Remove" });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`pubkey=${productData.pubkey}`)
    );

    const props = latestCallProps(mockDisplayCheckoutCost);
    expect(props.monetaryInfo.price).toBe(800);
    expect(props.monetaryInfo.totalCost).toBe(900);
    expect(props.monetaryInfo.discountPercentage).toBe(20);
  });

  it("shows discountError and leaves appliedDiscount at 0 when the API responds non-OK", async () => {
    renderCheckoutCard();

    fireEvent.change(screen.getByLabelText("Discount Code"), {
      target: { value: "badcode" },
    });
    mockFetchJsonOnce({}, { ok: false, status: 500 });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(
      await screen.findByText("Failed to validate discount code")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove" })
    ).not.toBeInTheDocument();
  });

  it("shows discountError and leaves appliedDiscount at 0 when the fetch call rejects", async () => {
    renderCheckoutCard();

    fireEvent.change(screen.getByLabelText("Discount Code"), {
      target: { value: "badcode" },
    });
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(
      await screen.findByText("Failed to apply discount code")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove" })
    ).not.toBeInTheDocument();
  });

  it("clears discountCode/appliedDiscount/discountError on handleRemoveDiscount", async () => {
    renderCheckoutCard();

    fireEvent.change(screen.getByLabelText("Discount Code"), {
      target: { value: "save20" },
    });
    mockFetchJsonOnce({ valid: true, discount_percentage: 20 });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByRole("button", { name: "Remove" });

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(
      screen.queryByRole("button", { name: "Remove" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(
      (screen.getByLabelText("Discount Code") as HTMLInputElement).value
    ).toBe("");
  });

  it("scopes the validation request to this product's pubkey (not a hardcoded value)", async () => {
    const { productData } = renderCheckoutCard({ pubkey: "unique_seller_123" });

    fireEvent.change(screen.getByLabelText("Discount Code"), {
      target: { value: "save20" },
    });
    mockFetchJsonOnce({ valid: true, discount_percentage: 20 });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await screen.findByRole("button", { name: "Remove" });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`pubkey=${productData.pubkey}`)
    );
  });
});

describe("pricing passthrough to ProductInvoiceCard", () => {
  it("passes the pre-discount price through as originalPrice, leaving discount re-derivation to the child", async () => {
    renderCheckoutCard({ price: 1000, shippingCost: 100, currency: "SATS" });

    fireEvent.change(screen.getByLabelText("Discount Code"), {
      target: { value: "save20" },
    });
    mockFetchJsonOnce({ valid: true, discount_percentage: 20 });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByRole("button", { name: "Remove" });

    fireEvent.click(screen.getByRole("button", { name: "Buy Now" }));

    expect(mockProductInvoiceCard).toHaveBeenCalled();
    const props = latestCallProps(mockProductInvoiceCard);
    expect(props.originalPrice).toBe(1000);
    expect(props.discountCode).toBe("SAVE20");
    expect(props.discountPercentage).toBe(20);
    expect(props.productData.price).toBe(800);
  });

  it("resolves volumePrice/weightPrice/bulkPrice from the matching productData map when a selection is active", () => {
    renderCheckoutCard(makeVariantProduct());

    fireEvent.click(screen.getByRole("button", { name: "S" }));
    fireEvent.click(screen.getByRole("button", { name: "500ml" }));
    fireEvent.click(screen.getByRole("button", { name: "1kg" }));
    fireEvent.click(screen.getByRole("button", { name: "bulk-5" }));

    fireEvent.click(screen.getByRole("button", { name: "Buy Now" }));

    expect(mockProductInvoiceCard).toHaveBeenCalled();
    const props = latestCallProps(mockProductInvoiceCard);
    expect(props.productData.volumePrice).toBe(700);
    expect(props.productData.weightPrice).toBe(800);
    expect(props.productData.bulkPrice).toBe(2000);
    expect(props.productData.selectedBulkOption).toBe(5);
  });
});

describe("handleAddToCart", () => {
  it("shows FailureModal instead of adding to cart when totalCost < 1", () => {
    renderCheckoutCard({ totalCost: 0, currency: "SATS" });

    fireEvent.click(screen.getByRole("button", { name: "Add To Cart" }));

    expect(
      screen.getByText(
        "The price and/or currency set for this listing was invalid."
      )
    ).toBeInTheDocument();
    expect(Storage.prototype.setItem).not.toHaveBeenCalledWith(
      "cart",
      expect.anything()
    );
  });

  it("shows FailureModal for an invalid currency", () => {
    renderCheckoutCard({ currency: "FAKECUR", totalCost: 500 });

    fireEvent.click(screen.getByRole("button", { name: "Add To Cart" }));

    expect(
      screen.getByText(
        "The price and/or currency set for this listing was invalid."
      )
    ).toBeInTheDocument();
  });

  it("persists {code: discountCode} into localStorage cartDiscounts keyed by productData.pubkey, guarded by isCartDiscountsMap", async () => {
    const { productData } = renderCheckoutCard({
      currency: "SATS",
      totalCost: 900,
    });

    fireEvent.change(screen.getByLabelText("Discount Code"), {
      target: { value: "save15" },
    });
    mockFetchJsonOnce({ valid: true, discount_percentage: 15 });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByRole("button", { name: "Remove" });

    fireEvent.click(screen.getByRole("button", { name: "Add To Cart" }));

    expect(Storage.prototype.setItem).toHaveBeenCalledWith(
      "cartDiscounts",
      JSON.stringify({ [productData.pubkey]: { code: "SAVE15" } })
    );
  });

  it("does not corrupt existing cartDiscounts entries for other products when adding this one", async () => {
    localStorage.setItem(
      "cartDiscounts",
      JSON.stringify({ other_seller_pubkey: { code: "OLD10" } })
    );
    const { productData } = renderCheckoutCard({
      currency: "SATS",
      totalCost: 900,
    });

    fireEvent.change(screen.getByLabelText("Discount Code"), {
      target: { value: "save15" },
    });
    mockFetchJsonOnce({ valid: true, discount_percentage: 15 });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByRole("button", { name: "Remove" });

    fireEvent.click(screen.getByRole("button", { name: "Add To Cart" }));

    expect(Storage.prototype.setItem).toHaveBeenCalledWith(
      "cartDiscounts",
      JSON.stringify({
        other_seller_pubkey: { code: "OLD10" },
        [productData.pubkey]: { code: "SAVE15" },
      })
    );
  });
});

describe("handleShare", () => {
  it("calls navigator.share when available", async () => {
    const shareMock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: shareMock,
      configurable: true,
    });
    const { productData } = renderCheckoutCard();

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(shareMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: productData.title,
          url: expect.stringContaining("/listing/"),
        })
      )
    );
  });

  it("falls back to clipboard + SuccessModal when navigator.share is undefined", async () => {
    const writeTextMock = jest.fn();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
    });
    renderCheckoutCard();

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining("/listing/")
    );
    expect(
      await screen.findByText("Listing URL copied to clipboard!")
    ).toBeInTheDocument();
  });
});

describe("Buy Now / Add to Cart gating", () => {
  it("disables both buttons when a required size/volume/weight selection is missing", () => {
    renderCheckoutCard(makeVariantProduct());

    expect(screen.getByRole("button", { name: "Buy Now" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add To Cart" })).toBeDisabled();
  });

  it("enables both buttons once all required selections are made", () => {
    renderCheckoutCard(makeVariantProduct());

    fireEvent.click(screen.getByRole("button", { name: "S" }));
    fireEvent.click(screen.getByRole("button", { name: "500ml" }));
    fireEvent.click(screen.getByRole("button", { name: "1kg" }));

    expect(screen.getByRole("button", { name: "Buy Now" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add To Cart" })).toBeEnabled();
  });

  it("opens SignInModal instead of toggling isBeingPaid when toggleBuyNow is clicked while logged out", () => {
    renderCheckoutCard({}, { signer: { pubkey: "", isLoggedIn: false } });

    fireEvent.click(screen.getByRole("button", { name: "Buy Now" }));

    expect(screen.getByTestId("sign-in-modal")).toBeInTheDocument();
    expect(mockProductInvoiceCard).not.toHaveBeenCalled();
  });
});

describe("cart hydration on mount", () => {
  it("hydrates cart state from the storage manager", () => {
    localStorage.setItem("cart", JSON.stringify([{ id: "prod1" }]));

    renderCheckoutCard({ id: "prod1" });

    expect(screen.getByRole("button", { name: "Add To Cart" })).toBeDisabled();
  });

  it("defaults to an empty cart when storage is empty", () => {
    renderCheckoutCard({ id: "prod1" });

    expect(screen.getByRole("button", { name: "Add To Cart" })).toBeEnabled();
  });
});
