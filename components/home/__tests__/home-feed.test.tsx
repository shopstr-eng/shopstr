import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import HomeFeed from "../home-feed";
import { ShopMapContext } from "@/utils/context/context";
import { ShopMap, ShopProfile } from "@/utils/types/types";

jest.mock("../marketplace", () => {
  // eslint-disable-next-line react/display-name
  return ({ focusedPubkey }: { focusedPubkey: string }) => (
    <div data-testid="mock-marketplace">Marketplace for: {focusedPubkey}</div>
  );
});

jest.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/",
  }),
}));

jest.mock("@braintree/sanitize-url", () => ({
  sanitizeUrl: (url: string) => url,
}));

const createMockContextValue = (
  shopData: Map<string, ShopProfile>
): ShopMap => ({
  shopData,
  setShopData: jest.fn(),
});

describe("HomeFeed Component", () => {
  const mockSetFocusedPubkey = jest.fn();
  const mockSetSelectedSection = jest.fn();

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockShopProfile: ShopProfile = {
    content: {
      ui: {
        banner: "https://example.com/banner.jpg",
        logo: "https://example.com/logo.png",
        storeName: "Test Shop",
      },
    },
  };

  it("should render MarketplacePage without a banner when focusedPubkey is empty", () => {
    const mockContextValue = createMockContextValue(new Map());

    render(
      <ShopMapContext.Provider value={mockContextValue}>
        <HomeFeed
          focusedPubkey=""
          setFocusedPubkey={mockSetFocusedPubkey}
          selectedSection="all"
          setSelectedSection={mockSetSelectedSection}
        />
      </ShopMapContext.Provider>
    );

    // Check that MarketplacePage is rendered
    expect(screen.getByTestId("mock-marketplace")).toBeInTheDocument();
    expect(screen.getByText("Marketplace for:")).toBeInTheDocument();

    // Check that the shop banner is not rendered
    expect(screen.queryByAltText("Shop Banner")).not.toBeInTheDocument();
  });

  it("should render the banner when a valid focusedPubkey is provided and data exists in context", async () => {
    const pubkey = "valid-pubkey";
    const shopData = new Map<string, ShopProfile>();
    shopData.set(pubkey, mockShopProfile);
    const mockContextValue = createMockContextValue(shopData);

    render(
      <ShopMapContext.Provider value={mockContextValue}>
        <HomeFeed
          focusedPubkey={pubkey}
          setFocusedPubkey={mockSetFocusedPubkey}
          selectedSection="all"
          setSelectedSection={mockSetSelectedSection}
        />
      </ShopMapContext.Provider>
    );

    // The banner should appear after the useEffect hook runs
    await waitFor(() => {
      const bannerImage = screen.getByAltText("Shop Banner");
      expect(bannerImage).toBeInTheDocument();
      expect(bannerImage).toHaveAttribute(
        "src",
        mockShopProfile.content.ui.banner
      );
    });

    // MarketplacePage should be rendered with the correct pubkey
    expect(screen.getByTestId("mock-marketplace")).toBeInTheDocument();
    expect(screen.getByText(`Marketplace for: ${pubkey}`)).toBeInTheDocument();
  });

  it("should not render the banner if focusedPubkey is provided but not found in context", () => {
    const pubkey = "invalid-pubkey";
    const mockContextValue = createMockContextValue(new Map()); // Empty map

    render(
      <ShopMapContext.Provider value={mockContextValue}>
        <HomeFeed
          focusedPubkey={pubkey}
          setFocusedPubkey={mockSetFocusedPubkey}
          selectedSection="all"
          setSelectedSection={mockSetSelectedSection}
        />
      </ShopMapContext.Provider>
    );

    // The banner should not be rendered
    expect(screen.queryByAltText("Shop Banner")).not.toBeInTheDocument();

    // MarketplacePage should still be rendered
    expect(screen.getByTestId("mock-marketplace")).toBeInTheDocument();
    expect(screen.getByText(`Marketplace for: ${pubkey}`)).toBeInTheDocument();
  });
});
