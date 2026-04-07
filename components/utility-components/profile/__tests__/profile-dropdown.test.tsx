import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
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
  const React = jest.requireActual("react");
  const DropdownContext = React.createContext({
    isOpen: false,
    onOpenChange: (_isOpen: boolean) => {},
  });

  return {
    ...originalModule,
    useDisclosure: () => ({
      isOpen: false,
      onOpen: mockOnOpen,
      onClose: jest.fn(),
    }),
    Dropdown: ({
      children,
      isOpen,
      onOpenChange,
    }: {
      children: React.ReactNode;
      isOpen?: boolean;
      onOpenChange?: (isOpen: boolean) => void;
    }) => (
      <DropdownContext.Provider
        value={{
          isOpen: Boolean(isOpen),
          onOpenChange: onOpenChange || (() => {}),
        }}
      >
        <div>{children}</div>
      </DropdownContext.Provider>
    ),
    DropdownTrigger: ({ children }: { children: React.ReactNode }) => {
      const { isOpen, onOpenChange } = React.useContext(DropdownContext);

      return (
        <button
          type="button"
          data-testid="dropdown-trigger"
          aria-expanded={isOpen}
          onClick={() => onOpenChange(!isOpen)}
        >
          {children}
        </button>
      );
    },
    DropdownMenu: ({
      items,
      children,
    }: {
      items: any[];
      children: (item: any) => React.ReactNode;
    }) => {
      const { isOpen } = React.useContext(DropdownContext);

      if (!isOpen) {
        return null;
      }

      return <div role="menu">{items.map((item) => children(item))}</div>;
    },
    DropdownItem: ({
      children,
      onPress,
      startContent,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      startContent?: React.ReactNode;
    }) => (
      <button role="menuitem" onClick={() => onPress?.()}>
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
  GlobeAltIcon: () => <div data-testid="icon-globe" />,
  ArrowRightStartOnRectangleIcon: () => <div data-testid="icon-logout" />,
  ClipboardIcon: () => <div data-testid="icon-clipboard" />,
  CheckIcon: () => <div data-testid="icon-check" />,
  ExclamationTriangleIcon: () => <div data-testid="icon-report" />,
  GlobeAltIcon: () => <div data-testid="icon-globe" />,
  CheckCircleIcon: () => <div data-testid="icon-success" />,
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
      value={{
        profileData,
        isLoading: false,
        updateProfileData: jest.fn(),
      }}
    >
      <SignerContext.Provider value={{ isLoggedIn }}>
        {ui}
      </SignerContext.Provider>
    </ProfileMapContext.Provider>
  );
};

const openDropdownMenu = () => {
  fireEvent.click(screen.getByTestId("dropdown-trigger"));
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
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ profile: null }),
    }) as typeof global.fetch;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("renders with fallback data and correct dropdown items", () => {
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["shop", "logout"]} />,
      {}
    );

    expect(screen.getByText(npub.slice(0, 15) + "...")).toBeInTheDocument();

    openDropdownMenu();

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
    jest.useFakeTimers();
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["shop"]} />,
      {}
    );

    openDropdownMenu();

    fireEvent.click(screen.getByText("Visit Seller"));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockRouterPush).toHaveBeenCalledWith(`/marketplace/${npub}`);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it('handles "Shop Profile" click', () => {
    jest.useFakeTimers();
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["shop_profile"]} />,
      {}
    );

    openDropdownMenu();

    fireEvent.click(screen.getByText("Shop Profile"));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/settings/shop-profile");
  });

  it('handles "Send Inquiry" click when logged in', () => {
    jest.useFakeTimers();
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["inquiry"]} />,
      { isLoggedIn: true }
    );

    openDropdownMenu();

    fireEvent.click(screen.getByText("Send Inquiry"));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/orders",
      query: { pk: npub, isInquiry: true },
    });
    expect(mockOnOpen).not.toHaveBeenCalled();
  });

  it('handles "Send Inquiry" click when logged out', () => {
    jest.useFakeTimers();
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["inquiry"]} />,
      { isLoggedIn: false }
    );

    openDropdownMenu();

    fireEvent.click(screen.getByText("Send Inquiry"));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockOnOpen).toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('handles "Profile" click', () => {
    jest.useFakeTimers();
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["user_profile"]} />,
      {}
    );

    openDropdownMenu();

    fireEvent.click(screen.getByText("Profile"));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/settings/user-profile");
  });

  it('handles "Settings" click', () => {
    jest.useFakeTimers();
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["settings"]} />,
      {}
    );

    openDropdownMenu();

    fireEvent.click(screen.getByText("Settings"));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/settings");
  });

  it('handles "Log Out" click', () => {
    jest.useFakeTimers();
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["logout"]} />,
      {}
    );

    openDropdownMenu();

    fireEvent.click(screen.getByText("Log Out"));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(LogOut).toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith("/marketplace");
  });

  it('handles "Copy npub" click and icon change with timeout', async () => {
    jest.useFakeTimers();

    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["copy_npub"]} />,
      {}
    );

    openDropdownMenu();

    expect(screen.getByTestId("icon-clipboard")).toBeInTheDocument();
    expect(screen.queryByTestId("icon-check")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Copy npub"));
    act(() => {
      jest.advanceTimersByTime(0);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(npub);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    openDropdownMenu();

    await waitFor(() => {
      expect(screen.queryByTestId("icon-clipboard")).not.toBeInTheDocument();
      expect(screen.getByTestId("icon-check")).toBeInTheDocument();
    });

    act(() => {
      jest.advanceTimersByTime(2100);
    });

    expect(screen.getByTestId("icon-clipboard")).toBeInTheDocument();
    expect(screen.queryByTestId("icon-check")).not.toBeInTheDocument();

    jest.useRealTimers();
  });

  it('renders "Report Profile" when requested', () => {
    renderWithProviders(
      <ProfileWithDropdown pubkey={pubkey} dropDownKeys={["report_profile"]} />,
      { isLoggedIn: true }
    );

    openDropdownMenu();

    expect(screen.getByText("Report Profile")).toBeInTheDocument();
    expect(screen.getByTestId("icon-report")).toBeInTheDocument();
  });
});
