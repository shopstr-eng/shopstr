import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ProductCard from "../product-card";
import { ReportsContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

jest.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/marketplace",
    push: jest.fn(),
  }),
}));

jest.mock("next/link", () => {
  const MockNextLink = ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  );
  MockNextLink.displayName = "MockNextLink";
  return MockNextLink;
});

jest.mock("../profile/profile-dropdown", () => ({
  ProfileWithDropdown: () => <div data-testid="profile-dropdown" />,
}));

jest.mock("../image-carousel", () => ({
  __esModule: true,
  default: () => <div data-testid="image-carousel" />,
}));

jest.mock("../display-monetary-info", () => ({
  __esModule: true,
  default: () => <div data-testid="price-display" />,
}));

jest.mock("../dropdowns/location-dropdown", () => ({
  locationAvatar: () => <span data-testid="location-avatar" />,
}));

jest.mock("../modals/event-modals", () => ({
  RawEventModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="raw-event-modal" /> : null,
  EventIdModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="event-id-modal" /> : null,
}));

jest.mock("@/components/utility-components/report-modal", () => ({
  __esModule: true,
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="report-modal">Report Modal</div> : null,
}));

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  getLocalStorageData: () => ({ relays: [] }),
}));

jest.mock("@heroicons/react/24/outline", () => ({
  ArrowTopRightOnSquareIcon: () => <span />, 
  EllipsisVerticalIcon: () => <span>...</span>,
  FlagIcon: () => <span>flag</span>,
}));

jest.mock("@nextui-org/react", () => {
  const ReactActual = jest.requireActual("react") as typeof import("react");
  const DropdownContext = ReactActual.createContext({
    isOpen: false,
    onOpenChange: (_next: boolean) => {},
  });

  return {
    Chip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Button: ({ children, onClick }: { children: React.ReactNode; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void }) => (
      <button onClick={onClick}>{children}</button>
    ),
    Dropdown: ({
      isOpen,
      onOpenChange,
      children,
    }: {
      isOpen?: boolean;
      onOpenChange?: (isOpen: boolean) => void;
      children: React.ReactNode;
    }) => (
      <DropdownContext.Provider
        value={{
          isOpen: !!isOpen,
          onOpenChange: onOpenChange || (() => {}),
        }}
      >
        {children}
      </DropdownContext.Provider>
    ),
    DropdownTrigger: ({ children }: { children: React.ReactElement }) => {
      const ctx = ReactActual.useContext(DropdownContext);
      return ReactActual.cloneElement(children, {
        onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
          children.props.onClick?.(e);
          ctx.onOpenChange(!ctx.isOpen);
        },
      });
    },
    DropdownMenu: ({ children }: { children: React.ReactNode }) => {
      const ctx = ReactActual.useContext(DropdownContext);
      if (!ctx.isOpen) return null;
      return <div role="menu">{children}</div>;
    },
    DropdownItem: ({
      children,
      onPress,
      isDisabled,
      className,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      isDisabled?: boolean;
      className?: string;
    }) => {
      if (className === "hidden") return null;
      return (
        <button disabled={isDisabled} onClick={onPress}>
          {children}
        </button>
      );
    },
  };
});

describe("ProductCard report dropdown behavior", () => {
  it("closes actions dropdown when opening report modal", () => {
    const productData: any = {
      id: "event-id-1",
      pubkey: "seller-pubkey",
      d: "listing-d-tag",
      categories: ["produce"],
      title: "Fresh Milk",
      status: "active",
      expiration: undefined,
      rawEvent: { id: "raw-1" },
      location: "Austin",
      images: ["https://example.com/image.png"],
      price: 10,
      currency: "USD",
    };

    render(
      <SignerContext.Provider
        value={{ isLoggedIn: true, pubkey: "buyer-pubkey" }}
      >
        <ReportsContext.Provider
          value={{
            reportEvents: [],
            profileReports: new Map(),
            listingReports: new Map(),
            isLoading: false,
            setReportsData: jest.fn(),
            addNewlyCreatedReportEvent: jest.fn(),
          }}
        >
          <ProductCard productData={productData} />
        </ReportsContext.Provider>
      </SignerContext.Provider>
    );

    const triggerButton = screen.getByRole("button", { name: "..." });
    fireEvent.click(triggerButton);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Report Listing" }));

    expect(screen.getByTestId("report-modal")).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
