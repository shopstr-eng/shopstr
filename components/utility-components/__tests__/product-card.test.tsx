import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ProductCard from "../product-card";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { ProfileMapContext } from "@/utils/context/context";
import {
  isP2pkEscrowFeatureEnabled,
  isSellerP2pkEscrowActive,
} from "@/utils/cashu/p2pk-checkout";

jest.mock("@/utils/cashu/p2pk-checkout", () => ({
  isP2pkEscrowFeatureEnabled: jest.fn().mockReturnValue(false),
  isSellerP2pkEscrowActive: jest.fn().mockReturnValue(false),
}));

const mockIsP2pkEscrowFeatureEnabled = isP2pkEscrowFeatureEnabled as jest.Mock;
const mockIsSellerP2pkEscrowActive = isSellerP2pkEscrowActive as jest.Mock;

const mockRouter = {
  pathname: "/product-page",
  push: jest.fn(),
};
jest.mock("next/router", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("../profile/profile-dropdown", () => ({
  ProfileWithDropdown: (props: any) => (
    <div
      data-testid="profile-dropdown"
      data-pubkey={props.pubkey}
      data-keys={JSON.stringify(props.dropDownKeys)}
    >
      <button data-testid="profile-dropdown-trigger">Seller</button>
    </div>
  ),
}));
jest.mock(
  "../image-carousel",
  () =>
    function MockImageCarousel(_props: any) {
      return <div data-testid="image-carousel" />;
    }
);
jest.mock("../display-monetary-info", () => ({
  __esModule: true,
  default: (_props: any) => <div data-testid="compact-price-display" />,
}));
jest.mock("../dropdowns/location-dropdown", () => ({
  locationAvatar: (location: string) => <div>{`Avatar for ${location}`}</div>,
}));

jest.mock("@heroui/react", () => ({
  ...jest.requireActual("@heroui/react"),
  Chip: ({ children, startContent }: any) => (
    <div>
      {startContent}
      {children}
    </div>
  ),
  useDisclosure: () => ({
    isOpen: false,
    onOpen: jest.fn(),
    onClose: jest.fn(),
  }),
}));

const mockProductData: ProductData = {
  id: "123",
  pubkey: "owner_pubkey",
  title: "Test Product",
  summary: "A great product summary.",
  images: ["image1.jpg"],
  categories: ["Electronics"],
  location: "Online",
  price: 1000,
  currency: "SATS",
  shippingType: "Free",
  status: "active",
  createdAt: 0,
  publishedAt: "",
  totalCost: 1000,
};

const mockSellerZapsnagProduct: ProductData = {
  ...mockProductData,
  d: "zapsnag",
  categories: ["zapsnag"],
};

const renderWithContext = (
  ui: React.ReactElement,
  userPubkey: string | null = null
) => {
  return render(
    <SignerContext.Provider
      value={{ pubkey: userPubkey, setPubkey: jest.fn() } as any}
    >
      {ui}
    </SignerContext.Provider>
  );
};

describe("ProductCard", () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
  });

  it("returns null if no productData is provided", () => {
    // @ts-expect-error: Intentionally passing null to test component's null-handling
    const { container } = render(<ProductCard productData={null} />);
    expect(container.firstChild).toBeNull();
  });

  describe("Standard View", () => {
    it("renders the standard card layout", () => {
      renderWithContext(<ProductCard productData={mockProductData} />);
      expect(screen.getByTestId("image-carousel")).toBeInTheDocument();
      expect(screen.getByTestId("profile-dropdown")).toBeInTheDocument();
      expect(screen.getByText("Test Product")).toBeInTheDocument();
      expect(screen.queryByText("Active")).not.toBeInTheDocument();
    });

    it("calls onProductClick when the card is clicked", () => {
      const mockOnClick = jest.fn();
      renderWithContext(
        <ProductCard
          productData={mockProductData}
          onProductClick={mockOnClick}
        />
      );
      fireEvent.click(screen.getByTestId("image-carousel").parentElement!);
      expect(mockOnClick).toHaveBeenCalledWith(
        mockProductData,
        expect.any(Object)
      );
    });

    it("navigates via router.push when href is provided", () => {
      renderWithContext(
        <ProductCard productData={mockProductData} href="/listing/test-slug" />
      );

      fireEvent.click(screen.getByTestId("image-carousel").parentElement!);
      expect(mockRouter.push).toHaveBeenCalledWith("/listing/test-slug");
    });

    it("navigates when pressing Enter on the linked card itself", () => {
      renderWithContext(
        <ProductCard productData={mockProductData} href="/listing/test-slug" />
      );

      fireEvent.keyDown(screen.getByRole("link"), { key: "Enter" });
      expect(mockRouter.push).toHaveBeenCalledWith("/listing/test-slug");
    });

    it("does not navigate when clicking seller dropdown area", () => {
      renderWithContext(
        <ProductCard productData={mockProductData} href="/listing/test-slug" />
      );

      fireEvent.click(screen.getByTestId("profile-dropdown-trigger"));
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it("does not navigate if onProductClick prevents default", () => {
      const onProductClick = jest.fn((_product, event) =>
        event?.preventDefault()
      );

      renderWithContext(
        <ProductCard
          productData={mockProductData}
          href="/listing/test-slug"
          onProductClick={onProductClick}
        />
      );

      fireEvent.click(screen.getByTestId("image-carousel").parentElement!);
      expect(onProductClick).toHaveBeenCalled();
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it("does not navigate when pressing Enter on nested controls inside a linked seller card", () => {
      renderWithContext(
        <ProductCard
          productData={mockSellerZapsnagProduct}
          href="/listing/test-slug"
        />,
        "owner_pubkey"
      );

      fireEvent.keyDown(
        screen.getByRole("button", {
          name: /open flash sale in nostr client/i,
        }),
        { key: "Enter" }
      );

      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('shows "shop_profile" dropdown key for the owner', () => {
      renderWithContext(
        <ProductCard productData={mockProductData} />,
        "owner_pubkey"
      );
      const dropdown = screen.getByTestId("profile-dropdown");
      const keys = JSON.parse(dropdown.getAttribute("data-keys")!);
      expect(keys).toEqual(["shop_profile"]);
    });

    it("shows correct dropdown keys for a non-owner", () => {
      renderWithContext(
        <ProductCard productData={mockProductData} />,
        "other_user_pubkey"
      );
      const dropdown = screen.getByTestId("profile-dropdown");
      const keys = JSON.parse(dropdown.getAttribute("data-keys")!);
      expect(keys).toEqual(["shop", "inquiry", "copy_npub", "report_profile"]);
    });

    it("shows sold status correctly", () => {
      renderWithContext(
        <ProductCard productData={{ ...mockProductData, status: "sold" }} />
      );
      expect(screen.getByText("Sold")).toBeInTheDocument();
    });

    it("shows a trusted report warning without hiding the listing", () => {
      renderWithContext(
        <ProductCard
          productData={mockProductData}
          reportSignal={{
            level: "trusted_warning",
            reportCount: 1,
            reportTypes: ["spam"],
          }}
        />
      );

      expect(screen.getByText("1 trusted listing report")).toBeInTheDocument();
      expect(screen.queryByText("Show listing")).not.toBeInTheDocument();
    });

    it("blurs a listing with enough trusted reports until revealed", () => {
      renderWithContext(
        <ProductCard
          productData={mockProductData}
          href="/listing/test-slug"
          reportSignal={{
            level: "trusted_blur",
            reportCount: 3,
            reportTypes: ["illegal"],
          }}
        />
      );

      expect(
        screen.getAllByText("3 trusted listing reports").length
      ).toBeGreaterThan(0);
      expect(
        screen.getByText("Reported by trusted marketplace contacts.")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Test Product").closest("[inert]")
      ).not.toBeNull();

      fireEvent.click(screen.getByText("Show listing"));
      expect(screen.queryByText("Show listing")).not.toBeInTheDocument();
      expect(screen.getByText("Test Product").closest("[inert]")).toBeNull();
    });
  });
});

// ── P2PK escrow badge — feature flag gating ───────────────────────────────────

const activeP2pk = {
  enabled: true,
  pubkey: "02aabb" + "cc".repeat(29),
  refundDelayDays: 7,
};

function renderWithP2pkSeller(flagEnabled: boolean) {
  mockIsP2pkEscrowFeatureEnabled.mockReturnValue(flagEnabled);
  mockIsSellerP2pkEscrowActive.mockReturnValue(true);

  const profileData = new Map<string, any>();
  profileData.set("owner_pubkey", { content: { p2pk: activeP2pk } });

  return render(
    <ProfileMapContext.Provider
      value={{ profileData, isLoading: false, updateProfileData: jest.fn() }}
    >
      <SignerContext.Provider
        value={{ pubkey: "buyer_pubkey", setPubkey: jest.fn() } as any}
      >
        <ProductCard productData={mockProductData} />
      </SignerContext.Provider>
    </ProfileMapContext.Provider>
  );
}

describe("ProductCard — P2PK escrow badge feature flag", () => {
  beforeEach(() => {
    mockIsP2pkEscrowFeatureEnabled.mockReturnValue(false);
    mockIsSellerP2pkEscrowActive.mockReturnValue(false);
  });

  it("hides the escrow badge when NEXT_PUBLIC_P2PK_ESCROW_ENABLED is off", () => {
    renderWithP2pkSeller(false);
    expect(screen.queryByText(/P2PK Escrow/i)).not.toBeInTheDocument();
  });

  it("shows the escrow badge when NEXT_PUBLIC_P2PK_ESCROW_ENABLED is on", () => {
    renderWithP2pkSeller(true);
    expect(screen.getByText(/P2PK Escrow/i)).toBeInTheDocument();
    expect(screen.getByText(/7d reclaim opens/i)).toBeInTheDocument();
  });
});
