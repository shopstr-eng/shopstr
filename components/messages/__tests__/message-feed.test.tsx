import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import MessageFeed from "../message-feed";
import { useTabs } from "@/components/hooks/use-tabs";

jest.mock("../messages", () => {
  return function MockMessages({ isPayment }: { isPayment: boolean }) {
    return (
      <div>
        {isPayment ? "Orders Messages Content" : "Inquiries Messages Content"}
      </div>
    );
  };
});

// Ported from upstream 86fdb9a. Upstream's OrdersDashboard takes
// sellerOnly/buyerOnly; downstream's takes filterBySellerPubkey. The mock is
// still required downstream because the real orders-dashboard transitively
// imports nostr-tools (ESM), which jest cannot load here.
jest.mock("../orders-dashboard", () => {
  return function MockOrdersDashboard(props: {
    filterBySellerPubkey?: string;
  }) {
    return (
      <div data-testid="orders-dashboard-props">
        filterBySellerPubkey:{String(props.filterBySellerPubkey)}
      </div>
    );
  };
});

// Downstream-only deps that also pull in nostr-tools / nip98 ESM modules and
// would otherwise break the suite at import time.
jest.mock("../subscription-management", () => {
  return function MockSubscriptionManagement() {
    return <div data-testid="subscription-management" />;
  };
});
jest.mock("../contacts-dashboard", () => {
  return function MockContactsDashboard() {
    return <div data-testid="contacts-dashboard" />;
  };
});
jest.mock("@/utils/nostr/nip98-auth", () => ({
  createNip98AuthorizationHeader: jest.fn(async () => "Nostr mock-auth"),
}));
// nostr-context-provider transitively imports nostr-tools (ESM); stub it with a
// real React context so MessageFeed's useContext(SignerContext) works without
// loading the untransformable module.
jest.mock("@/components/utility-components/nostr-context-provider", () => {
  const React = require("react");
  return {
    __esModule: true,
    SignerContext: React.createContext({}),
  };
});

jest.mock("@/components/framer", () => ({
  Framer: {
    Tabs: () => <div data-testid="framer-tabs">Mocked Tabs</div>,
  },
}));

const mockRouterEvents: { on: jest.Mock; off: jest.Mock } = {
  on: jest.fn(),
  off: jest.fn(),
};
jest.mock("next/router", () => ({
  useRouter: jest.fn(() => ({
    events: mockRouterEvents,
  })),
}));

const mockSetSelectedTab = jest.fn();
jest.mock("@/components/hooks/use-tabs");
const mockUseTabs = useTabs as jest.Mock;

describe("MessageFeed Component", () => {
  jest.useFakeTimers();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  test('renders with "Orders" as the default initial tab', () => {
    mockUseTabs.mockReturnValue({
      selectedTab: {
        id: "orders",
        children: <div>Orders Messages Content</div>,
      },
      tabProps: {
        setSelectedTab: mockSetSelectedTab,
        selectedTabIndex: 0,
      },
    });

    render(<MessageFeed />);

    act(() => {
      jest.runAllTimers();
    });

    expect(mockUseTabs).toHaveBeenCalledWith(
      expect.objectContaining({ initialTabId: "orders" })
    );
    // Upstream 86fdb9a asserts the Orders tab wires buyerOnly:true. Downstream
    // has no buyer/seller split — the single OrdersDashboard is scoped via
    // filterBySellerPubkey — so we assert that prop is wired instead.
    expect(mockUseTabs.mock.calls[0]![0].tabs[0].children.props).toHaveProperty(
      "filterBySellerPubkey"
    );
    expect(screen.getByText("Orders Messages Content")).toBeInTheDocument();
    expect(
      screen.queryByText("Inquiries Messages Content")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("framer-tabs")).toBeInTheDocument();
  });

  test('renders with "Inquiries" as the initial tab when isInquiry is true', () => {
    mockUseTabs.mockReturnValue({
      selectedTab: {
        id: "inquiries",
        children: <div>Inquiries Messages Content</div>,
      },
      tabProps: {
        setSelectedTab: mockSetSelectedTab,
        selectedTabIndex: 1,
      },
    });

    render(<MessageFeed isInquiry={true} />);

    // Fast-forward timers
    act(() => {
      jest.runAllTimers();
    });

    expect(mockUseTabs).toHaveBeenCalledWith(
      expect.objectContaining({ initialTabId: "inquiries" })
    );
    expect(screen.getByText("Inquiries Messages Content")).toBeInTheDocument();
    expect(
      screen.queryByText("Orders Messages Content")
    ).not.toBeInTheDocument();
  });

  // Ported from upstream 86fdb9a ("wires the Orders tab to the buyer-only
  // dashboard view"). Upstream split orders into buyer-only/seller-only
  // dashboards and asserted buyerOnly:true. Downstream uses a single
  // OrdersDashboard scoped via filterBySellerPubkey (no buyer/seller split),
  // so we assert the Orders tab wires that prop instead.
  test("wires the Orders tab to the orders dashboard view", () => {
    mockUseTabs.mockImplementation(({ tabs }) => ({
      selectedTab: {
        id: "orders",
        children: tabs[0].children,
      },
      tabProps: {
        setSelectedTab: mockSetSelectedTab,
        selectedTabIndex: 0,
      },
    }));

    render(<MessageFeed />);

    act(() => {
      jest.runAllTimers();
    });

    expect(
      mockUseTabs.mock.calls[mockUseTabs.mock.calls.length - 1]![0].tabs[0]
        .children.props
    ).toEqual(
      expect.objectContaining({
        filterBySellerPubkey: undefined,
      })
    );
  });

  test("subscribes to route changes on mount and cleans up on unmount", () => {
    mockUseTabs.mockReturnValue({
      selectedTab: { children: null },
      tabProps: {},
    });

    const { unmount } = render(<MessageFeed />);

    const onCallCount = mockRouterEvents.on.mock.calls.length;
    expect(onCallCount).toBeGreaterThanOrEqual(1);
    expect(mockRouterEvents.on).toHaveBeenCalledWith(
      "routeChangeComplete",
      expect.any(Function)
    );

    // Unmount the component
    unmount();

    expect(mockRouterEvents.off).toHaveBeenCalledTimes(onCallCount);
    expect(mockRouterEvents.off).toHaveBeenCalledWith(
      "routeChangeComplete",
      expect.any(Function)
    );
  });

  test("changes tab when route changes to include isInquiry=true", () => {
    mockUseTabs.mockReturnValue({
      selectedTab: { id: "orders", children: <div /> },
      tabProps: {
        setSelectedTab: mockSetSelectedTab,
        selectedTabIndex: 0,
      },
    });

    render(<MessageFeed />);

    const routeChangeHandler = mockRouterEvents.on.mock.calls[0][1];

    act(() => {
      routeChangeHandler("/messages?isInquiry=true");
    });

    expect(mockSetSelectedTab).toHaveBeenCalledTimes(1);
    // Downstream tab order is orders(0), subscriptions(1), inquiries(2), so the
    // inquiries route resolves to index 2 (upstream had only orders/inquiries).
    expect(mockSetSelectedTab).toHaveBeenCalledWith([2, 0]);
  });

  test("changes tab when route changes to NOT include isInquiry=true", () => {
    mockUseTabs.mockReturnValue({
      selectedTab: { id: "inquiries", children: <div /> },
      tabProps: {
        setSelectedTab: mockSetSelectedTab,
        selectedTabIndex: 1,
      },
    });

    render(<MessageFeed isInquiry={true} />);

    const routeChangeHandler = mockRouterEvents.on.mock.calls[0][1];

    act(() => {
      routeChangeHandler("/messages");
    });

    expect(mockSetSelectedTab).toHaveBeenCalledTimes(1);
    expect(mockSetSelectedTab).toHaveBeenCalledWith([0, 0]);
  });
});
