import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import MilkMarketSlider from "../mm-slider";
import { FollowsContext } from "@/utils/context/context";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";

const mockUseTheme = { theme: "light" };
jest.mock("next-themes", () => ({
  useTheme: () => mockUseTheme,
}));

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  getLocalStorageData: jest.fn(() => ({ wot: 5 })),
}));

jest.mock("@/utils/STATIC-VARIABLES", () => ({
  BLACKBUTTONCLASSNAMES: "mock-button-class",
}));

const mockOnChangeEnd = jest.fn();
jest.mock("@nextui-org/react", () => ({
  Slider: (props: any) => {
    mockOnChangeEnd.mockImplementation((value) => props.onChangeEnd(value));
    return (
      <div
        data-testid="slider"
        data-max-value={props.maxValue}
        data-color={props.color}
      >
        {props.label}
      </div>
    );
  },
  Button: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

const mockReload = jest.fn();
const mockLocalStorageSetItem = jest.fn();
Object.defineProperty(window, "location", {
  value: { reload: mockReload },
  writable: true,
});
Object.defineProperty(window, "localStorage", {
  value: { setItem: mockLocalStorageSetItem },
  writable: true,
});

const renderWithContext = (contextValue: any) => {
  return render(
    <FollowsContext.Provider value={contextValue}>
      <MilkMarketSlider />
    </FollowsContext.Provider>
  );
};

describe("MilkMarketSlider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTheme.theme = "light";
  });

  it("initializes with a value from localStorage and does not show the refresh button", () => {
    renderWithContext({});
    expect(getLocalStorageData).toHaveBeenCalled();
    expect(screen.getByTestId("slider")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Refresh to Apply" })
    ).not.toBeInTheDocument();
  });

  it("sets slider color based on the theme", () => {
    const { rerender } = renderWithContext({});
    expect(screen.getByTestId("slider")).toHaveAttribute(
      "data-color",
      "secondary"
    );

    mockUseTheme.theme = "dark";
    rerender(
      <FollowsContext.Provider value={{}}>
        <MilkMarketSlider />
      </FollowsContext.Provider>
    );
    expect(screen.getByTestId("slider")).toHaveAttribute(
      "data-color",
      "warning"
    );
  });

  it("uses firstDegreeFollowsLength for maxValue when available", () => {
    const contextValue = { isLoading: false, firstDegreeFollowsLength: 150 };
    renderWithContext(contextValue);
    expect(screen.getByTestId("slider")).toHaveAttribute(
      "data-max-value",
      "150"
    );
  });

  it("uses the wot value for maxValue when context data is not available", () => {
    const contextValue = { isLoading: true };
    renderWithContext(contextValue);
    expect(screen.getByTestId("slider")).toHaveAttribute("data-max-value", "5");
  });

  it("updates wot, calls localStorage.setItem, and shows the refresh button on slider change", () => {
    renderWithContext({});

    expect(
      screen.queryByRole("button", { name: "Refresh to Apply" })
    ).not.toBeInTheDocument();

    act(() => {
      mockOnChangeEnd(10);
    });

    expect(mockLocalStorageSetItem).toHaveBeenCalledWith("wot", "10");
    expect(
      screen.getByRole("button", { name: "Refresh to Apply" })
    ).toBeInTheDocument();
  });

  it("handles array values from the slider correctly", () => {
    renderWithContext({});
    act(() => {
      mockOnChangeEnd([20]);
    });
    expect(mockLocalStorageSetItem).toHaveBeenCalledWith("wot", "20");
    expect(
      screen.getByRole("button", { name: "Refresh to Apply" })
    ).toBeInTheDocument();
  });

  it("calls window.location.reload and hides the button when 'Refresh to Apply' is clicked", () => {
    renderWithContext({});

    act(() => {
      mockOnChangeEnd(15);
    });

    const refreshButton = screen.getByRole("button", {
      name: "Refresh to Apply",
    });
    expect(refreshButton).toBeInTheDocument();

    fireEvent.click(refreshButton);

    expect(mockReload).toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Refresh to Apply" })
    ).not.toBeInTheDocument();
  });
});
