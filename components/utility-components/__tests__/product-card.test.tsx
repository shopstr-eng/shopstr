import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ProductCard from "../product-card";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { ProductData } from "@/utils/parsers/product-parser-functions";

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
      expect(screen.getByText("Active")).toBeInTheDocument();
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
      const onProductClick = jest.fn((_product, event) => event?.preventDefault());

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
      expect(keys).toEqual(["shop", "inquiry", "copy_npub"]);
    });

    it("shows sold status correctly", () => {
      renderWithContext(
        <ProductCard productData={{ ...mockProductData, status: "sold" }} />
      );
      expect(screen.getByText("Sold")).toBeInTheDocument();
    });
  });
});
