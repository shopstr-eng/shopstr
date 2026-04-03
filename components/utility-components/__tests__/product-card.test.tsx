import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ProductCard from "../product-card";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { ReportsContext } from "@/utils/context/context";

const mockRouter = {
  pathname: "/product-page",
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
    ></div>
  ),
}));
jest.mock("@/components/utility-components/report-modal", () => ({
  __esModule: true,
  default: () => null,
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

jest.mock("@nextui-org/react", () => ({
  ...jest.requireActual("@nextui-org/react"),
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

const renderWithContext = (
  ui: React.ReactElement,
  userPubkey: string | null = null,
  reportContextOverrides?: {
    profileReports?: Map<string, Array<{ id: string; kind: number }>>;
    listingReports?: Map<string, Array<{ id: string; kind: number }>>;
  }
) => {
  const reportsContextValue = {
    reportEvents: [],
    profileReports: reportContextOverrides?.profileReports || new Map(),
    listingReports: reportContextOverrides?.listingReports || new Map(),
    isLoading: false,
    setReportsData: jest.fn(),
    addNewlyCreatedReportEvent: jest.fn(),
  };

  return render(
    <ReportsContext.Provider
      value={reportsContextValue as React.ContextType<typeof ReportsContext>}
    >
      <SignerContext.Provider
        value={
          {
            pubkey: userPubkey,
            setPubkey: jest.fn(),
          } as React.ContextType<typeof SignerContext>
        }
      >
        {ui}
      </SignerContext.Provider>
    </ReportsContext.Provider>
  );
};

describe("ProductCard", () => {
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
      expect(keys).toEqual(["shop", "inquiry", "copy_npub", "report"]);
    });

    it("shows sold status correctly", () => {
      renderWithContext(
        <ProductCard productData={{ ...mockProductData, status: "sold" }} />
      );
      expect(screen.getByText("Sold")).toBeInTheDocument();
    });

    it("shows deduplicated report count badge", () => {
      const profileReports = new Map([
        [
          "owner_pubkey",
          [
            { id: "r1", kind: 1984 },
            { id: "r2", kind: 1984 },
          ],
        ],
      ]);
      const listingReports = new Map([
        [
          "30402:owner_pubkey:listing-d",
          [
            { id: "r2", kind: 1984 },
            { id: "r3", kind: 1984 },
          ],
        ],
      ]);

      renderWithContext(
        <ProductCard productData={{ ...mockProductData, d: "listing-d" }} />,
        "other_user_pubkey",
        {
          profileReports,
          listingReports,
        }
      );

      expect(screen.getByText("Reports: 3")).toBeInTheDocument();
    });
  });
});
