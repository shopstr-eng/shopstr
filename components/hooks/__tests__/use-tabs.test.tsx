import { renderHook, act } from "@testing-library/react";
import { useTabs, Tab } from "../use-tabs";

const mockTabs: Tab[] = [
  { id: "profile", label: "Profile", children: <div>Profile Content</div> },
  { id: "settings", label: "Settings", children: <div>Settings Content</div> },
  { id: "billing", label: "Billing", children: <div>Billing Content</div> },
];

describe("useTabs Hook", () => {
  it("should initialize with the correct tab from initialTabId", () => {
    const { result } = renderHook(() =>
      useTabs({ tabs: mockTabs, initialTabId: "settings" })
    );

    expect(result.current.selectedTab!.id).toBe("settings");
    expect(result.current.tabProps.selectedTabIndex).toBe(1);
  });

  it("should default to the first tab if initialTabId is not found", () => {
    const { result } = renderHook(() =>
      useTabs({ tabs: mockTabs, initialTabId: "non-existent-id" })
    );

    expect(result.current.selectedTab!.id).toBe("profile");
    expect(result.current.tabProps.selectedTabIndex).toBe(0);
  });

  it("should update the selected tab and direction when setSelectedTab is called", () => {
    const { result } = renderHook(() =>
      useTabs({ tabs: mockTabs, initialTabId: "profile" })
    );

    expect(result.current.tabProps.selectedTabIndex).toBe(0);

    act(() => {
      // Simulate changing to the third tab (index 2) with a forward direction (1)
      result.current.tabProps.setSelectedTab([2, 1]);
    });

    expect(result.current.selectedTab!.id).toBe("billing");
    expect(result.current.tabProps.selectedTabIndex).toBe(2);
    expect(result.current.contentProps.direction).toBe(1);
  });

  it("should pass the onChange function through its props", () => {
    const mockOnChange = jest.fn();

    const { result } = renderHook(() =>
      useTabs({
        tabs: mockTabs,
        initialTabId: "profile",
        onChange: mockOnChange,
      })
    );

    // The hook doesn't call onChange itself, but it should pass it along
    // for the component to use. We verify it's the same function.
    expect(result.current.tabProps.onChange).toBe(mockOnChange);
  });
});
