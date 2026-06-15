import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// jsdom doesn't implement ResizeObserver — stub it so checkout-card effects don't throw
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
import CheckoutCard from "../checkout-card";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  ProductContext,
  ShopMapContext,
  ReviewsContext,
} from "@/utils/context/context";
import { isP2pkEscrowFeatureEnabled } from "@/utils/cashu/p2pk-checkout";

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("@/utils/cashu/p2pk-checkout", () => ({
  isP2pkEscrowFeatureEnabled: jest.fn().mockReturnValue(false),
}));

jest.mock("next/router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("nostr-tools", () => ({
  nip19: { decode: jest.fn(), encode: jest.fn() },
  Event: {},
}));

jest.mock("@heroui/react", () => {
  const React = require("react");
  return {
    Button: ({ children, onClick, isDisabled }: any) =>
      React.createElement(
        "button",
        { onClick, disabled: isDisabled },
        children
      ),
    Chip: ({ children, startContent }: any) =>
      React.createElement(
        "div",
        { "data-testid": "chip" },
        startContent,
        children
      ),
    Input: ({ label, value, onChange }: any) =>
      React.createElement("input", {
        "aria-label": label,
        value: value ?? "",
        onChange,
      }),
    useDisclosure: () => ({
      isOpen: false,
      onOpen: jest.fn(),
      onClose: jest.fn(),
    }),
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

jest.mock("@/components/utility-components/display-monetary-info", () => ({
  DisplayCheckoutCost: () => null,
}));

jest.mock("@/components/product-invoice-card", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/free-shipping-notification", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/utility-components/failure-modal", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/utility-components/success-modal", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/sign-in/SignInModal", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/utility-components/volume-selector", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/utility-components/weight-selector", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/utility-components/bulk-selector", () => ({
  __esModule: true,
  default: () => null,
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

jest.mock("@/utils/safe-json", () => ({
  getLocalStorageJson: jest.fn().mockReturnValue(null),
}));

jest.mock("@/utils/cart-discounts", () => ({
  isCartDiscountsMap: jest.fn().mockReturnValue(false),
}));

jest.mock("../../public/currencySelection.json", () => [], { virtual: true });

// ── Typed mock handle ─────────────────────────────────────────────────────────

const mockIsP2pkEscrowFeatureEnabled = isP2pkEscrowFeatureEnabled as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockProductData = {
  id: "prod1",
  pubkey: "seller_pubkey",
  title: "Test Item",
  summary: "A test item.",
  images: ["img.jpg"],
  categories: [],
  location: "Online",
  price: 500,
  currency: "SATS",
  shippingType: "Free",
  status: "active",
  createdAt: 0,
  publishedAt: "",
  totalCost: 500,
} as any;

const enabledP2pk = { enabled: true, refundDelayDays: 7 };

// ── Render helper ─────────────────────────────────────────────────────────────

function renderCheckoutCard(p2pk?: typeof enabledP2pk) {
  return render(
    <SignerContext.Provider
      value={
        {
          pubkey: "buyer_pubkey",
          isLoggedIn: true,
          setPubkey: jest.fn(),
        } as any
      }
    >
      <ProductContext.Provider
        value={{
          productEvents: [],
          isLoading: false,
          addNewlyCreatedProductEvent: jest.fn(),
          removeDeletedProductEvent: jest.fn(),
        }}
      >
        <ShopMapContext.Provider
          value={{
            shopData: new Map(),
            isLoading: false,
            updateShopData: jest.fn(),
          }}
        >
          <ReviewsContext.Provider
            value={{
              merchantReviewsData: new Map(),
              productReviewsData: new Map(),
              isLoading: false,
              updateMerchantReviewsData: jest.fn(),
              updateProductReviewsData: jest.fn(),
            }}
          >
            <CheckoutCard
              productData={mockProductData}
              setInvoiceIsPaid={jest.fn()}
              setInvoiceGenerationFailed={jest.fn()}
              setCashuPaymentSent={jest.fn()}
              setCashuPaymentFailed={jest.fn()}
              p2pk={p2pk}
            />
          </ReviewsContext.Provider>
        </ShopMapContext.Provider>
      </ProductContext.Provider>
    </SignerContext.Provider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CheckoutCard — P2PK escrow badge feature flag", () => {
  beforeEach(() => {
    mockIsP2pkEscrowFeatureEnabled.mockReturnValue(false);
  });

  it("hides the badge when NEXT_PUBLIC_P2PK_ESCROW_ENABLED is off", () => {
    renderCheckoutCard(enabledP2pk);
    expect(screen.queryByText(/P2PK Escrow Enabled/i)).not.toBeInTheDocument();
  });

  it("shows the badge when NEXT_PUBLIC_P2PK_ESCROW_ENABLED is on", () => {
    mockIsP2pkEscrowFeatureEnabled.mockReturnValue(true);
    renderCheckoutCard(enabledP2pk);
    expect(screen.getByText(/P2PK Escrow Enabled/i)).toBeInTheDocument();
  });

  it("hides the badge when flag is on but p2pk prop is absent", () => {
    mockIsP2pkEscrowFeatureEnabled.mockReturnValue(true);
    renderCheckoutCard(undefined);
    expect(screen.queryByText(/P2PK Escrow Enabled/i)).not.toBeInTheDocument();
  });

  it("hides the badge when flag is on but p2pk.enabled is false", () => {
    mockIsP2pkEscrowFeatureEnabled.mockReturnValue(true);
    renderCheckoutCard({ enabled: false, refundDelayDays: 7 });
    expect(screen.queryByText(/P2PK Escrow Enabled/i)).not.toBeInTheDocument();
  });
});
