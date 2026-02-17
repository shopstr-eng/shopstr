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

jest.mock("@/components/framer", () => ({
  Framer: {
    Tabs: () => <div data-testid="framer-tabs">Mocked Tabs</div>,
  },
}));

const mockRouterEvents: { [key: string]: jest.Mock } = {
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
    expect(mockSetSelectedTab).toHaveBeenCalledWith([1, 0]);
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
