import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SideShopNav from "../side-shop-nav";
import { ShopMapContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { useDisclosure } from "@nextui-org/react";
import { useRouter } from "next/router";

jest.mock("next/router", () => ({ __esModule: true, useRouter: jest.fn() }));

jest.mock("@/components/hooks/use-navigation", () => ({
  __esModule: true,
  default: () => ({ isMessagesActive: false }),
}));

jest.mock("@nextui-org/react", () => ({
  ...jest.requireActual("@nextui-org/react"),
  useDisclosure: jest.fn(),
}));

jest.mock("../../sign-in/SignInModal", () => {
  const SignInModal = () => <div data-testid="mock-signin-modal" />;
  SignInModal.displayName = "SignInModal";
  return SignInModal;
});

const renderComponent = ({
  isLoggedIn = false,
  isEditingShop = false,
  categories = [],
  aboutText = "",
}) => {
  const MOCK_VALID_PUBKEY = "a1".repeat(32);
  const mockRouterPush = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({
    push: mockRouterPush,
  });

  const mockOnOpen = jest.fn();
  (useDisclosure as jest.Mock).mockReturnValue({
    isOpen: false,
    onOpen: mockOnOpen,
    onClose: jest.fn(),
  });

  const mockShopData = new Map();
  if (aboutText) {
    mockShopData.set(MOCK_VALID_PUBKEY, { content: { about: aboutText } });
  }

  const mockSetSelectedCategories = jest.fn();

  render(
    <SignerContext.Provider
      value={{ isLoggedIn, pubkey: isLoggedIn ? "user-pubkey" : null }}
    >
      <ShopMapContext.Provider value={{ shopData: mockShopData }}>
        <SideShopNav
          focusedPubkey={MOCK_VALID_PUBKEY}
          categories={categories}
          setSelectedCategories={mockSetSelectedCategories}
          isEditingShop={isEditingShop}
        />
      </ShopMapContext.Provider>
    </SignerContext.Provider>
  );

  return { mockRouterPush, mockOnOpen, mockSetSelectedCategories };
};

describe("SideShopNav Component", () => {
  describe("Normal Mode", () => {
    it("should render categories and call setSelectedCategories with the correct category set", async () => {
      const { mockSetSelectedCategories } = renderComponent({
        categories: ["Tops", "Shoes", "Tops"],
      });

      // Check for rendered categories and their counts
      expect(screen.getByText("- Tops (2)")).toBeInTheDocument();
      const shoesButton = screen.getByText("- Shoes (1)");
      expect(shoesButton).toBeInTheDocument();

      // Test clicking a specific category
      await userEvent.click(shoesButton);
      expect(mockSetSelectedCategories).toHaveBeenCalledWith(
        new Set(["Shoes"])
      );
    });

    it('should call setSelectedCategories with an empty set when "All listings" is clicked', async () => {
      const { mockSetSelectedCategories } = renderComponent({
        categories: ["Tops"],
      });

      const allListingsButton = screen.getByText("All listings");
      await userEvent.click(allListingsButton);

      expect(mockSetSelectedCategories).toHaveBeenCalledWith(new Set([]));
    });

    it("should navigate with correct query params when 'Message seller' is clicked while logged in", async () => {
      const { mockRouterPush } = renderComponent({ isLoggedIn: true });

      await userEvent.click(screen.getByText("Message seller"));

      expect(mockRouterPush).toHaveBeenCalledWith({
        pathname: "/orders",
        query: { pk: expect.any(String), isInquiry: true },
      });
    });

    it("should open sign-in modal when 'Message seller' is clicked while logged out", async () => {
      const { mockOnOpen } = renderComponent({ isLoggedIn: false });

      await userEvent.click(screen.getByText("Message seller"));

      expect(mockOnOpen).toHaveBeenCalled();
    });

    it("should render the 'About' section when about text is provided", () => {
      renderComponent({ aboutText: "Welcome to our test shop!" });

      expect(screen.getByText("About")).toBeInTheDocument();
      expect(screen.getByText("Welcome to our test shop!")).toBeInTheDocument();
    });
  });

  describe("Editing Mode", () => {
    it("should render 'Add Listing' and 'Edit Shop' buttons", () => {
      renderComponent({ isEditingShop: true });

      expect(
        screen.getByRole("button", { name: "Add Listing" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Edit Shop" })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Message seller" })
      ).not.toBeInTheDocument();
    });

    it("should navigate to add listing page when 'Add Listing' is clicked while logged in", async () => {
      const { mockRouterPush } = renderComponent({
        isEditingShop: true,
        isLoggedIn: true,
      });

      await userEvent.click(screen.getByText("Add Listing"));

      expect(mockRouterPush).toHaveBeenCalledWith("?addNewListing");
    });

    it("should open sign-in modal when 'Add Listing' is clicked while logged out", async () => {
      const { mockOnOpen } = renderComponent({
        isEditingShop: true,
        isLoggedIn: false,
      });

      await userEvent.click(screen.getByText("Add Listing"));

      expect(mockOnOpen).toHaveBeenCalled();
    });

    it("should navigate to the shop profile settings when 'Edit Shop' is clicked", async () => {
      const { mockRouterPush } = renderComponent({ isEditingShop: true });

      await userEvent.click(screen.getByText("Edit Shop"));

      expect(mockRouterPush).toHaveBeenCalledWith("settings/shop-profile");
    });
  });
});
