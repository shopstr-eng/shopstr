import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import ShopstrSlider from "../shopstr-slider";
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
  SHOPSTRBUTTONCLASSNAMES: "mock-button-class",
}));

const mockOnChangeEnd = jest.fn();
jest.mock("@heroui/react", () => ({
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

const mockLocalStorageSetItem = jest.fn();
Object.defineProperty(window, "localStorage", {
  value: { setItem: mockLocalStorageSetItem },
  writable: true,
});

const renderWithContext = (contextValue: any) => {
  return render(
    <FollowsContext.Provider value={contextValue}>
      <ShopstrSlider />
    </FollowsContext.Provider>
  );
};

describe("ShopstrSlider", () => {
  const defaultFollowsContext = {
    followList: [],
    firstDegreeFollowsLength: 0,
    isLoading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTheme.theme = "light";
  });

  it("initializes with a value from localStorage and does not show the refresh button", () => {
    renderWithContext(defaultFollowsContext);
    expect(getLocalStorageData).toHaveBeenCalled();
    expect(screen.getByTestId("slider")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Refresh to Apply" })
    ).not.toBeInTheDocument();
  });

  it("sets slider color based on the theme", () => {
    const { rerender } = renderWithContext(defaultFollowsContext);
    expect(screen.getByTestId("slider")).toHaveAttribute(
      "data-color",
      "secondary"
    );

    mockUseTheme.theme = "dark";
    rerender(
      <FollowsContext.Provider value={defaultFollowsContext}>
        <ShopstrSlider />
      </FollowsContext.Provider>
    );
    expect(screen.getByTestId("slider")).toHaveAttribute(
      "data-color",
      "warning"
    );
  });

  it("uses firstDegreeFollowsLength for maxValue when available", () => {
    const contextValue = {
      followList: [],
      isLoading: false,
      firstDegreeFollowsLength: 150,
    };
    renderWithContext(contextValue);
    expect(screen.getByTestId("slider")).toHaveAttribute(
      "data-max-value",
      "150"
    );
  });

  it("uses the wot value for maxValue when context data is not available", () => {
    const contextValue = {
      followList: [],
      firstDegreeFollowsLength: 0,
      isLoading: true,
    };
    renderWithContext(contextValue);
    expect(screen.getByTestId("slider")).toHaveAttribute("data-max-value", "5");
  });

  it("updates wot, calls localStorage.setItem, and shows the refresh button on slider change", () => {
    renderWithContext(defaultFollowsContext);

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
    renderWithContext(defaultFollowsContext);
    act(() => {
      mockOnChangeEnd([20]);
    });
    expect(mockLocalStorageSetItem).toHaveBeenCalledWith("wot", "20");
    expect(
      screen.getByRole("button", { name: "Refresh to Apply" })
    ).toBeInTheDocument();
  });

  it("calls window.location.reload and hides the button when 'Refresh to Apply' is clicked", () => {
    renderWithContext(defaultFollowsContext);

    act(() => {
      mockOnChangeEnd(15);
    });

    const refreshButton = screen.getByRole("button", {
      name: "Refresh to Apply",
    });
    expect(refreshButton).toBeInTheDocument();

    fireEvent.click(refreshButton);

    expect(
      screen.queryByRole("button", { name: "Refresh to Apply" })
    ).not.toBeInTheDocument();
  });
});
