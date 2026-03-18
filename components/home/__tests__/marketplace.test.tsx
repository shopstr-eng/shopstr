import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MarketplacePage from "../marketplace";
import {
  ShopMapContext,
  ReviewsContext,
  FollowsContext,
} from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { nip19 } from "nostr-tools";
import { useRouter } from "next/router";

jest.mock(
  "../../display-products",
  () =>
    function MockDisplayProducts() {
      return <div data-testid="mock-display-products" />;
    }
);
jest.mock(
  "../side-shop-nav",
  () =>
    function MockSideShopNav() {
      return <div data-testid="mock-side-shop-nav" />;
    }
);
jest.mock(
  "../../sign-in/SignInModal",
  () =>
    function MockSignInModal() {
      return <div data-testid="mock-signin-modal" />;
    }
);

jest.mock("next/router", () => ({ __esModule: true, useRouter: jest.fn() }));
jest.mock("nostr-tools", () => ({
  nip19: {
    decode: jest.fn(),
    naddrEncode: jest.fn(),
    npubEncode: jest.fn().mockReturnValue("encoded-pubkey"),
  },
}));

import { useDisclosure } from "@nextui-org/react";
jest.mock("@nextui-org/react", () => ({
  ...jest.requireActual("@nextui-org/react"),
  useDisclosure: jest.fn(),
}));

const renderComponent = ({
  focusedPubkey = "",
  routerQuery = {},
  isLoggedIn = true,
}: {
  focusedPubkey?: string;
  routerQuery?: any;
  isLoggedIn?: boolean;
}) => {
  const mockRouterPush = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({
    push: mockRouterPush,
    query: routerQuery,
    pathname: "/marketplace",
    asPath: "/marketplace",
  });
  if (routerQuery.npub) {
    (nip19.decode as jest.Mock).mockReturnValue({ data: "decoded-pubkey" });
  }

  const mockOnOpen = jest.fn();
  const mockOnClose = jest.fn();
  (useDisclosure as jest.Mock).mockReturnValue({
    isOpen: false,
    onOpen: mockOnOpen,
    onClose: mockOnClose,
  });

  const mockShopData = new Map<string, any>();
  if (focusedPubkey) {
    mockShopData.set(focusedPubkey, {
      content: {
        about: "This is a test shop.",
        ui: { banner: "test-banner.jpg" },
      },
    });
  }

  const setFocusedPubkey = jest.fn();
  const setSelectedSection = jest.fn();

  render(
    <SignerContext.Provider
      value={{ isLoggedIn, pubkey: isLoggedIn ? "user-pubkey" : null }}
    >
      <ShopMapContext.Provider value={{ shopData: mockShopData }}>
        <ReviewsContext.Provider
          value={{
            merchantReviewsData: new Map(),
            productReviewsData: new Map(),
          }}
        >
          <FollowsContext.Provider value={{ followList: [], isLoading: false }}>
            <MarketplacePage
              focusedPubkey={focusedPubkey}
              setFocusedPubkey={setFocusedPubkey}
              selectedSection={focusedPubkey ? "shop" : ""}
              setSelectedSection={setSelectedSection}
            />
          </FollowsContext.Provider>
        </ReviewsContext.Provider>
      </ShopMapContext.Provider>
    </SignerContext.Provider>
  );

  return { setFocusedPubkey, setSelectedSection, mockRouterPush, mockOnOpen };
};

describe("MarketplacePage Component", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    // Suppress NextUI useMemo warnings
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    (nip19.decode as jest.Mock).mockClear();
  });

  it("renders general view when no shop is focused", () => {
    renderComponent({});
    expect(screen.getByTestId("mock-display-products")).toBeInTheDocument();
    expect(screen.queryByTestId("mock-side-shop-nav")).not.toBeInTheDocument();
  });

  it("renders shop-specific view when a shop is focused", () => {
    renderComponent({ focusedPubkey: "shop1" });
    expect(screen.getByTestId("mock-side-shop-nav")).toBeInTheDocument();
  });

  it("calls setFocusedPubkey when npub appears in URL", () => {
    const { setFocusedPubkey, setSelectedSection } = renderComponent({
      routerQuery: { npub: ["npub-test"] },
    });
    expect(nip19.decode).toHaveBeenCalledWith("npub-test");
    expect(setFocusedPubkey).toHaveBeenCalledWith("decoded-pubkey");
    expect(setSelectedSection).toHaveBeenCalledWith("shop");
  });

  it("calls setSelectedSection when Reviews and About tabs are clicked", async () => {
    const { setSelectedSection } = renderComponent({ focusedPubkey: "shop1" });

    // Reviews
    await userEvent.click(screen.getByRole("button", { name: "Reviews" }));
    expect(setSelectedSection).toHaveBeenCalledWith("reviews");

    // About
    await userEvent.click(screen.getByRole("button", { name: "About" }));
    expect(setSelectedSection).toHaveBeenCalledWith("about");
  });

  it("navigates to orders when clicking Message as logged-in user", async () => {
    const { mockRouterPush } = renderComponent({
      focusedPubkey: "shop1",
      isLoggedIn: true,
    });
    await userEvent.click(screen.getByRole("button", { name: "Message" }));
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/orders",
      query: { pk: expect.any(String), isInquiry: true },
    });
  });

  it("opens sign-in modal when clicking Message as logged-out user", async () => {
    const { mockOnOpen } = renderComponent({
      focusedPubkey: "shop1",
      isLoggedIn: false,
    });
    await userEvent.click(screen.getByRole("button", { name: "Message" }));
    expect(mockOnOpen).toHaveBeenCalled();
  });
});
