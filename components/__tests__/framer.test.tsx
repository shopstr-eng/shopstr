import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Framer } from "../framer";
import type { Tab } from "@/components/hooks/use-tabs";

jest.mock("framer-motion", () => {
  const original = jest.requireActual("framer-motion");
  return {
    ...original,
    motion: {
      ...original.motion,
      button: jest.fn(
        ({
          whileTap: _whileTap,
          transition: _transition,
          children,
          ...rest
        }) => <button {...rest}>{children}</button>
      ),
    },
  };
});

describe("Framer.Tabs", () => {
  const mockTabs: Tab[] = [
    { label: "Tab 1", id: "tab-1", children: <div /> },
    { label: "Tab 2", id: "tab-2", children: <div /> },
    { label: "Tab 3", id: "tab-3", children: <div /> },
  ];

  const mockSetSelectedTab = jest.fn();

  beforeEach(() => {
    mockSetSelectedTab.mockClear();
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

  it("should render every tab with the bold pill-button styling", () => {
    render(
      <Framer.Tabs
        tabs={mockTabs}
        selectedTabIndex={1}
        setSelectedTab={mockSetSelectedTab}
      />
    );

    mockTabs.forEach((t) => {
      const tab = screen.getByText(t.label);
      // Every tab is a clickable pill button
      expect(tab).toHaveClass("font-bold");
      expect(tab).toHaveClass("border-2");
      expect(tab).toHaveClass("rounded-md");
    });
  });

  it("should mark only the selected tab with the active highlight color", () => {
    render(
      <Framer.Tabs
        tabs={mockTabs}
        selectedTabIndex={1}
        setSelectedTab={mockSetSelectedTab}
      />
    );

    expect(screen.getByText("Tab 2")).toHaveClass("bg-primary-yellow");
    expect(screen.getByText("Tab 1")).toHaveClass("bg-white");
    expect(screen.getByText("Tab 3")).toHaveClass("bg-white");
  });

  it("should expose aria-selected so the active tab is announced to assistive tech", () => {
    render(
      <Framer.Tabs
        tabs={mockTabs}
        selectedTabIndex={2}
        setSelectedTab={mockSetSelectedTab}
      />
    );

    expect(screen.getByText("Tab 3")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Tab 1")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("Tab 2")).toHaveAttribute("aria-selected", "false");
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
});
