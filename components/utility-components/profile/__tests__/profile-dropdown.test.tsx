import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ProfileWithDropdown } from "../profile-dropdown";
import { ProfileMapContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { LogOut } from "@/utils/nostr/nostr-helper-functions";
import { nip19 } from "nostr-tools";
import React from "react";

const mockRouterPush = jest.fn();
jest.mock("next/router", () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  ...jest.requireActual("@/utils/nostr/nostr-helper-functions"),
  LogOut: jest.fn(),
}));

const mockOnOpen = jest.fn();
jest.mock("@nextui-org/react", () => {
  const originalModule = jest.requireActual("@nextui-org/react");
  return {
    ...originalModule,
    useDisclosure: () => ({
      isOpen: false,
      onOpen: mockOnOpen,
      onClose: jest.fn(),
    }),
    Dropdown: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownTrigger: ({ children }: { children: React.ReactNode }) => children,
    DropdownMenu: ({
      items,
      children,
    }: {
      items: any[];
      children: (item: any) => React.ReactNode;
    }) => <div role="menu">{items.map((item) => children(item))}</div>,
    DropdownItem: ({
      children,
      onClick,
      startContent,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      startContent?: React.ReactNode;
    }) => (
      <button role="menuitem" onClick={onClick}>
        {startContent}
        {children}
      </button>
    ),
    User: jest.fn(({ name }) => <span>{name}</span>),
  };
});

jest.mock("@heroicons/react/24/outline", () => ({
  BuildingStorefrontIcon: () => <div data-testid="icon-store" />,
  ChatBubbleBottomCenterIcon: () => <div data-testid="icon-chat" />,
  UserIcon: () => <div data-testid="icon-user" />,
  Cog6ToothIcon: () => <div data-testid="icon-settings" />,
  ArrowRightStartOnRectangleIcon: () => <div data-testid="icon-logout" />,
  ClipboardIcon: () => <div data-testid="icon-clipboard" />,
  CheckIcon: () => <div data-testid="icon-check" />,
}));

Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: jest.fn(),
  },
  writable: true,
});

const renderWithProviders = (
  ui: React.ReactElement,
  options: { profileData?: Map<string, any>; isLoggedIn?: boolean } = {}
) => {
  const { profileData = new Map(), isLoggedIn = false } = options;
  return render(
    <ProfileMapContext.Provider
      value={{ profileData, setProfileData: jest.fn() }}
    >
      <SignerContext.Provider value={{ isLoggedIn, setIsLoggedIn: jest.fn() }}>
        {ui}
      </SignerContext.Provider>
    </ProfileMapContext.Provider>
  );
};

describe("ProfileWithDropdown", () => {
  const pubkey =
    "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
  const npub = nip19.npubEncode(pubkey);
  let consoleWarnSpy: jest.SpyInstance;

  beforeAll(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterAll(() => {
    consoleWarnSpy.mockRestore();
  });

  beforeEach(() => {
    mockRouterPush.mockClear();
    mockOnOpen.mockClear();
    (LogOut as jest.Mock).mockClear();
    (navigator.clipboard.writeText as jest.Mock).mockClear();
  });

  it("renders with fallback data and correct dropdown items", () => {
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["shop", "logout"]} />,
      {}
    );

    expect(screen.getByText(npub.slice(0, 15) + "...")).toBeInTheDocument();
    expect(screen.getByText("Visit Seller")).toBeInTheDocument();
    expect(screen.getByText("Log Out")).toBeInTheDocument();
    expect(screen.queryByText("Send Inquiry")).not.toBeInTheDocument();
  });

  it("renders with profile data from context", () => {
    const profile = {
      content: { name: "testuser", picture: "http://pic.com/img.png" },
    };
    const profileMap = new Map();
    profileMap.set(pubkey, profile);

    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={[]} />,
      { profileData: profileMap }
    );

    expect(screen.getByText("testuser")).toBeInTheDocument();
  });

  it('handles "Visit Seller" click', () => {
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["shop"]} />,
      {}
    );
    fireEvent.click(screen.getByText("Visit Seller"));
    expect(mockRouterPush).toHaveBeenCalledWith(`/marketplace/${npub}`);
  });

  it('handles "Shop Profile" click', () => {
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["shop_profile"]} />,
      {}
    );
    fireEvent.click(screen.getByText("Shop Profile"));
    expect(mockRouterPush).toHaveBeenCalledWith("/settings/shop-profile");
  });

  it('handles "Send Inquiry" click when logged in', () => {
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["inquiry"]} />,
      { isLoggedIn: true }
    );
    fireEvent.click(screen.getByText("Send Inquiry"));
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/orders",
      query: { pk: npub, isInquiry: true },
    });
    expect(mockOnOpen).not.toHaveBeenCalled();
  });

  it('handles "Send Inquiry" click when logged out', () => {
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["inquiry"]} />,
      { isLoggedIn: false }
    );
    fireEvent.click(screen.getByText("Send Inquiry"));
    expect(mockOnOpen).toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('handles "Profile" click', () => {
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["user_profile"]} />,
      {}
    );
    fireEvent.click(screen.getByText("Profile"));
    expect(mockRouterPush).toHaveBeenCalledWith("/settings/user-profile");
  });

  it('handles "Settings" click', () => {
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["settings"]} />,
      {}
    );
    fireEvent.click(screen.getByText("Settings"));
    expect(mockRouterPush).toHaveBeenCalledWith("/settings");
  });

  it('handles "Log Out" click', () => {
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["logout"]} />,
      {}
    );
    fireEvent.click(screen.getByText("Log Out"));
    expect(LogOut).toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith("/marketplace");
  });

  it('handles "Copy npub" click and icon change with timeout', () => {
    jest.useFakeTimers();

    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["copy_npub"]} />,
      {}
    );

    expect(screen.getByTestId("icon-clipboard")).toBeInTheDocument();
    expect(screen.queryByTestId("icon-check")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Copy npub"));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(npub);
    expect(screen.queryByTestId("icon-clipboard")).not.toBeInTheDocument();
    expect(screen.getByTestId("icon-check")).toBeInTheDocument();

    act(() => {
      jest.runAllTimers();
    });

    expect(screen.getByTestId("icon-clipboard")).toBeInTheDocument();
    expect(screen.queryByTestId("icon-check")).not.toBeInTheDocument();

    jest.useRealTimers();
  });
});
