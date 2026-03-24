import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { motion } from "framer-motion";
import { Framer } from "../framer";
import type { Tab } from "@/components/hooks/use-tabs";

jest.mock("framer-motion", () => {
  const original = jest.requireActual("framer-motion");
  return {
    ...original,
    motion: {
      ...original.motion,
      div: jest.fn(
        ({ _initial, _animate, _transition, _variants, children, ...rest }) => (
          <div {...rest}>{children}</div>
        )
      ),
    },
  };
});

beforeAll(() => {
  Element.prototype.getBoundingClientRect = jest.fn(() => ({
    width: 100,
    height: 40,
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
});

describe("Framer.Tabs", () => {
  const mockTabs: Tab[] = [
    { label: "Tab 1" },
    { label: "Tab 2" },
    { label: "Tab 3" },
  ];

  const mockSetSelectedTab = jest.fn();

  beforeEach(() => {
    mockSetSelectedTab.mockClear();
    (motion.div as jest.Mock).mockClear();
    jest.clearAllMocks();
  });

  it("should render all tabs with their labels", () => {
    render(
      <Framer.Tabs
        tabs={mockTabs}
        selectedTabIndex={0}
        setSelectedTab={mockSetSelectedTab}
      />
    );

    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
    expect(screen.getByText("Tab 3")).toBeInTheDocument();
  });

  it("should apply active styles to the selected tab and inactive styles to others", () => {
    render(
      <Framer.Tabs
        tabs={mockTabs}
        selectedTabIndex={1}
        setSelectedTab={mockSetSelectedTab}
      />
    );

    const activeTab = screen.getByText("Tab 2");
    const inactiveTab = screen.getByText("Tab 1");

    expect(activeTab).toHaveClass("font-bold");
    expect(inactiveTab).not.toHaveClass("font-bold");
  });

  it("should call setSelectedTab with the correct index and direction when a tab is clicked", () => {
    render(
      <Framer.Tabs
        tabs={mockTabs}
        selectedTabIndex={0}
        setSelectedTab={mockSetSelectedTab}
      />
    );

    fireEvent.click(screen.getByText("Tab 3"));
    expect(mockSetSelectedTab).toHaveBeenCalledTimes(1);
    expect(mockSetSelectedTab).toHaveBeenCalledWith([2, 1]);
  });

  it("should calculate the direction as -1 when moving to a previous tab", () => {
    render(
      <Framer.Tabs
        tabs={mockTabs}
        selectedTabIndex={2}
        setSelectedTab={mockSetSelectedTab}
      />
    );

    fireEvent.click(screen.getByText("Tab 1"));
    expect(mockSetSelectedTab).toHaveBeenCalledTimes(1);
    expect(mockSetSelectedTab).toHaveBeenCalledWith([0, -1]);
  });

  it("should render the animated indicator div after positions are calculated", async () => {
    render(
      <Framer.Tabs
        tabs={mockTabs}
        selectedTabIndex={0}
        setSelectedTab={mockSetSelectedTab}
      />
    );

    await waitFor(() => {
      const motionDiv = motion.div as jest.Mock;
      expect(motionDiv).toHaveBeenCalled();
    });
  });

  it("should clean up the resize event listener on unmount", () => {
    const removeEventListenerSpy = jest.spyOn(window, "removeEventListener");

    const { unmount } = render(
      <Framer.Tabs
        tabs={mockTabs}
        selectedTabIndex={0}
        setSelectedTab={mockSetSelectedTab}
      />
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "resize",
      expect.any(Function)
    );

    removeEventListenerSpy.mockRestore();
  });
});
