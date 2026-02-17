import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { ShopMapContext } from "@/utils/context/context";
import { ShopProfile } from "@/utils/types/types";

jest.mock("next/router", () => ({
  __esModule: true,
  default: {
    push: jest.fn(),
  },
}));

import router from "next/router";
const mockRouterPush = router.push as jest.Mock;

const mockOnOpen = jest.fn();
jest.mock("@nextui-org/react", () => ({
  ...jest.requireActual("@nextui-org/react"),
  useDisclosure: () => ({
    isOpen: false,
    onOpen: mockOnOpen,
    onClose: jest.fn(),
  }),
}));

jest.mock(
  "../../display-products",
  () =>
    function MockDisplayProducts() {
      return <div data-testid="display-products-mock" />;
    }
);
jest.mock(
  "../../sign-in/SignInModal",
  () =>
    function MockSignInModal() {
      return <div data-testid="signin-modal-mock" />;
    }
);
jest.mock(
  "../../home/side-shop-nav",
  () =>
    function MockSideShopNav() {
      return <div data-testid="side-shop-nav-mock" />;
    }
);
jest.mock("@braintree/sanitize-url", () => ({
  sanitizeUrl: (url: string) => url,
}));
jest.mock("@heroicons/react/24/outline", () => ({
  Bars3Icon: () => <div data-testid="bars3-icon-mock">Open Menu</div>,
}));

import MyListingsPage from "../my-listings";

const loggedInUser = { pubkey: "user-pubkey-123" };
const loggedOutUser = { pubkey: null };
const shopProfile: ShopProfile = {
  content: {
    ui: { banner: "http://example.com/banner.jpg" },
    about: "This is the test shop about section.",
  },
};
const mockShopDataContextWithProfile = {
  shopData: new Map([[loggedInUser.pubkey, shopProfile]]),
};
const mockShopDataContextEmpty = { shopData: new Map() };

const renderComponent = (signerContextValue: any, shopContextValue: any) => {
  return render(
    <SignerContext.Provider value={signerContextValue}>
      <ShopMapContext.Provider value={shopContextValue}>
        <MyListingsPage />
      </ShopMapContext.Provider>
    </SignerContext.Provider>
  );
};

describe("MyListingsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("When user is logged out", () => {
    beforeEach(() => {
      renderComponent(loggedOutUser, mockShopDataContextEmpty);
    });

    test("does not render user-specific content", () => {
      expect(
        screen.queryByTestId("display-products-mock")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("side-shop-nav-mock")
      ).not.toBeInTheDocument();
      expect(screen.queryByAltText("Shop Banner")).not.toBeInTheDocument();
    });

    test('opens sign-in modal when trying to "Add Listing"', () => {
      fireEvent.click(screen.getAllByText("Add Listing")[0]);
      expect(mockOnOpen).toHaveBeenCalledTimes(1);
      expect(mockRouterPush).not.toHaveBeenCalled();
    });

    test('opens sign-in modal when trying to "Edit Shop"', () => {
      fireEvent.click(screen.getAllByText("Edit Shop")[0]);
      expect(mockOnOpen).toHaveBeenCalledTimes(1);
      expect(mockRouterPush).not.toHaveBeenCalled();
    });

    test('opens sign-in modal when trying to view "Orders"', () => {
      const desktopOrdersButton = screen.getAllByRole("button", {
        name: "Orders",
      })[0];
      fireEvent.click(desktopOrdersButton);
      expect(mockOnOpen).toHaveBeenCalledTimes(1);
      expect(mockRouterPush).not.toHaveBeenCalled();
    });
  });

  describe("When user is logged in", () => {
    describe("and has a shop profile", () => {
      beforeEach(() => {
        renderComponent(loggedInUser, mockShopDataContextWithProfile);
      });

      test("fetches and displays shop banner and about info", () => {
        expect(screen.getByAltText("Shop Banner")).toBeInTheDocument();
        expect(screen.getByAltText("Shop Banner")).toHaveAttribute(
          "src",
          shopProfile.content.ui.banner
        );

        fireEvent.click(screen.getAllByRole("button", { name: "About" })[0]);
        expect(
          screen.getByRole("heading", { name: /about/i, level: 2 })
        ).toBeInTheDocument();
        expect(screen.getByText(shopProfile.content.about)).toBeInTheDocument();
      });

      test("renders Listings section by default", () => {
        expect(screen.getByTestId("display-products-mock")).toBeInTheDocument();
        expect(screen.getByTestId("side-shop-nav-mock")).toBeInTheDocument();
      });
    });

    describe("and has no shop profile", () => {
      beforeEach(() => {
        renderComponent(loggedInUser, mockShopDataContextEmpty);
      });

      test("does not display shop banner", () => {
        expect(screen.queryByAltText("Shop Banner")).not.toBeInTheDocument();
      });

      test('shows "Nothing here" message in About section', () => {
        fireEvent.click(screen.getAllByRole("button", { name: "About" })[0]);
        expect(screen.getByText("Nothing here . . . yet!")).toBeInTheDocument();
        expect(
          screen.getByText("Set up your shop in settings!")
        ).toBeInTheDocument();
      });
    });

    test("navigates correctly when clicking action buttons", () => {
      renderComponent(loggedInUser, mockShopDataContextEmpty);

      fireEvent.click(screen.getAllByText("Add Listing")[0]);
      expect(mockRouterPush).toHaveBeenCalledWith("?addNewListing");

      fireEvent.click(screen.getAllByText("Edit Shop")[0]);
      expect(mockRouterPush).toHaveBeenCalledWith("settings/shop-profile");

      fireEvent.click(screen.getAllByRole("button", { name: "Orders" })[0]);
      expect(mockRouterPush).toHaveBeenCalledWith("/orders");
    });
  });

  describe("Navigation and UI", () => {
    beforeEach(() => {
      renderComponent(loggedInUser, mockShopDataContextWithProfile);
    });

    test("switches between Listings and About sections", () => {
      expect(screen.getByTestId("display-products-mock")).toBeInTheDocument();
      expect(
        screen.queryByText(shopProfile.content.about)
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getAllByRole("button", { name: "About" })[0]);
      expect(
        screen.queryByTestId("display-products-mock")
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: /about/i, level: 2 })
      ).toBeInTheDocument();
      expect(screen.getByText(shopProfile.content.about)).toBeInTheDocument();

      fireEvent.click(screen.getAllByRole("button", { name: "Listings" })[0]);
      expect(screen.getByTestId("display-products-mock")).toBeInTheDocument();
      expect(
        screen.queryByText(shopProfile.content.about)
      ).not.toBeInTheDocument();
    });

    test("mobile menu opens and closes on click", () => {
      const menuButton = screen
        .getAllByTestId("bars3-icon-mock")[0]
        .closest("button");
      expect(menuButton).toBeInTheDocument();

      expect(
        screen.queryByText("Listings", { selector: ".absolute button" })
      ).toBeNull();

      fireEvent.click(menuButton!);
      expect(
        screen.getByText("Listings", { selector: ".absolute button" })
      ).toBeInTheDocument();
      expect(
        screen.getByText("About", { selector: ".absolute button" })
      ).toBeInTheDocument();

      fireEvent.click(menuButton!);
      expect(
        screen.queryByText("Listings", { selector: ".absolute button" })
      ).toBeNull();
    });

    test("mobile menu closes on outside click", () => {
      const menuButton = screen
        .getAllByTestId("bars3-icon-mock")[0]
        .closest("button");
      fireEvent.click(menuButton!);
      expect(
        screen.getByText("Listings", { selector: ".absolute button" })
      ).toBeInTheDocument();

      fireEvent.mouseDown(document.body);
      expect(
        screen.queryByText("Listings", { selector: ".absolute button" })
      ).toBeNull();
    });
  });
});
