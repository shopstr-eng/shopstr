import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MarketplacePage, { normalizeNpub } from "../marketplace";
import {
  ShopMapContext,
  ReviewsContext,
  FollowsContext,
  ProfileMapContext,
} from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { nip19 } from "nostr-tools";
import { useRouter } from "next/router";
import { findPubkeyByProfileSlug, isNpub } from "@/utils/url-slugs";

jest.mock("@/utils/url-slugs", () => ({
  getListingSlug: jest.fn(),
  getProfileSlug: jest.fn(() => "mock-profile"),
  findPubkeyByProfileSlug: jest.fn(),
  isNpub: jest.fn(() => true),
}));

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

import { useDisclosure } from "@heroui/react";
jest.mock("@heroui/react", () => ({
  ...jest.requireActual("@heroui/react"),
  useDisclosure: jest.fn(),
}));

const renderComponent = ({
  focusedPubkey = "",
  routerQuery = {},
  isLoggedIn = true,
  followList = [],
  firstDegreeFollowsLength = 0,
  isFollowsLoading = false,
}: {
  focusedPubkey?: string;
  routerQuery?: any;
  isLoggedIn?: boolean;
  followList?: string[];
  firstDegreeFollowsLength?: number;
  isFollowsLoading?: boolean;
}) => {
  const mockRouterPush = jest.fn();
  const mockRouterReplace = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({
    push: mockRouterPush,
    replace: mockRouterReplace,
    query: routerQuery,
    pathname: "/marketplace",
    asPath: "/marketplace",
  });
  if (
    typeof routerQuery.npub === "string" ||
    (Array.isArray(routerQuery.npub) && typeof routerQuery.npub[0] === "string")
  ) {
    (nip19.decode as jest.Mock).mockReturnValue({
      type: "npub",
      data: "decoded-pubkey",
    });
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
      value={{ isLoggedIn, pubkey: isLoggedIn ? "user-pubkey" : undefined }}
    >
      <ShopMapContext.Provider
        value={{
          shopData: mockShopData,
          isLoading: false,
          updateShopData: jest.fn(),
        }}
      >
        <ProfileMapContext.Provider
          value={{
            profileData: new Map(),
            isLoading: false,
            updateProfileData: jest.fn(),
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
            <FollowsContext.Provider
              value={{
                followList,
                firstDegreeFollowsLength,
                isLoading: isFollowsLoading,
              }}
            >
              <MarketplacePage
                focusedPubkey={focusedPubkey}
                setFocusedPubkey={setFocusedPubkey}
                selectedSection={focusedPubkey ? "shop" : ""}
                setSelectedSection={setSelectedSection}
              />
            </FollowsContext.Provider>
          </ReviewsContext.Provider>
        </ProfileMapContext.Provider>
      </ShopMapContext.Provider>
    </SignerContext.Provider>
  );

  return {
    setFocusedPubkey,
    setSelectedSection,
    mockRouterPush,
    mockRouterReplace,
    mockOnOpen,
  };
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
    (findPubkeyByProfileSlug as jest.Mock).mockReset();
    (isNpub as jest.Mock).mockReset();
    (isNpub as jest.Mock).mockReturnValue(true);
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
      routerQuery: { npub: ["npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"] },
    });
    expect(nip19.decode).toHaveBeenCalledWith(
      "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"
    );
    expect(setFocusedPubkey).toHaveBeenCalledWith("decoded-pubkey");
    expect(setSelectedSection).toHaveBeenCalledWith("shop");
  });

  it("calls nip19.decode for a valid string npub query", () => {
    const validNpub = "  npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq  ";

    renderComponent({
      routerQuery: { npub: validNpub },
    });

    expect(nip19.decode).toHaveBeenCalledWith(validNpub.trim());
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

  it("hides the Trust toggle when logged out", () => {
    renderComponent({
      isLoggedIn: false,
      followList: ["followed-pubkey"],
      firstDegreeFollowsLength: 1,
    });

    expect(screen.queryByText("Trust")).not.toBeInTheDocument();
  });

  it("hides the Trust toggle when logged in with no direct follows", () => {
    renderComponent({
      isLoggedIn: true,
      followList: [],
      firstDegreeFollowsLength: 0,
    });

    expect(screen.queryByText("Trust")).not.toBeInTheDocument();
  });

  it("shows the Trust toggle when logged in with direct follows", () => {
    renderComponent({
      isLoggedIn: true,
      followList: ["followed-pubkey"],
      firstDegreeFollowsLength: 1,
    });

    expect(screen.getByText("Trust")).toBeInTheDocument();
  });

  it.each([
    { label: "undefined", value: undefined, expected: null },
    { label: "empty string", value: "", expected: null },
    {
      label: "array",
      value: ["  npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq  ", "ignored"],
      expected: "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
    },
  ])(
    "normalizeNpub returns the expected value for %s",
    ({ value, expected }) => {
      expect(normalizeNpub(value)).toBe(expected);
    }
  );

  it.each([
    { label: "undefined", npub: undefined },
    { label: "empty string", npub: "" },
    { label: "array", npub: ["", "extra-segment"] },
  ])("handles %s npub query safely", ({ npub }) => {
    (isNpub as jest.Mock).mockReturnValue(false);
    (findPubkeyByProfileSlug as jest.Mock).mockReturnValue(undefined);
    const routerQuery = npub === undefined ? {} : { npub };

    expect(() => renderComponent({ routerQuery })).not.toThrow();
    expect(nip19.decode).not.toHaveBeenCalled();
    expect(findPubkeyByProfileSlug).not.toHaveBeenCalled();
  });
});
