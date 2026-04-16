import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ShopstrSwitch from "../shopstr-switch";
import { UIContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

const mockUseTheme = { theme: "light" };
jest.mock("next-themes", () => ({
  useTheme: () => mockUseTheme,
}));

const mockRouterPush = jest.fn();
jest.mock("next/router", () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

jest.mock("@heroui/react", () => ({
  Switch: (props: {
    onValueChange: (value: boolean) => void;
    isSelected: boolean;
    color: string;
  }) => (
    <button
      role="switch"
      onClick={() => props.onValueChange(!props.isSelected)}
      data-color={props.color}
    />
  ),
}));

describe("ShopstrSwitch", () => {
  const mockSetWotFilter = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTheme.theme = "light";
  });

  it("should call setWotFilter with the inverted value when clicked", () => {
    render(<ShopstrSwitch wotFilter={false} setWotFilter={mockSetWotFilter} />);
    const switchControl = screen.getByRole("switch");

    fireEvent.click(switchControl);

    expect(mockSetWotFilter).toHaveBeenCalledWith(true);
  });

  it("should call setPreferencesModalOpen when the 'Trust' label is clicked", () => {
    const mockSetPreferencesModalOpen = jest.fn();

    render(
      <SignerContext.Provider
        value={{ isLoggedIn: true } as any}
      >
        <UIContext.Provider
          value={{
            isPreferencesModalOpen: false,
            setPreferencesModalOpen: mockSetPreferencesModalOpen,
          }}
        >
          <ShopstrSwitch wotFilter={false} setWotFilter={jest.fn()} />
        </UIContext.Provider>
      </SignerContext.Provider>
    );

    const trustLabel = screen.getByText("Trust");

    fireEvent.click(trustLabel);

    expect(mockSetPreferencesModalOpen).toHaveBeenCalledWith(true);
  });

  it("should route to preferences when the user is logged out and clicks 'Trust'", () => {
    render(
      <SignerContext.Provider
        value={{ isLoggedIn: false } as any}
      >
        <UIContext.Provider
          value={{
            isPreferencesModalOpen: false,
            setPreferencesModalOpen: jest.fn(),
          }}
        >
          <ShopstrSwitch wotFilter={false} setWotFilter={jest.fn()} />
        </UIContext.Provider>
      </SignerContext.Provider>
    );

    fireEvent.click(screen.getByText("Trust"));

    expect(mockRouterPush).toHaveBeenCalledWith("/settings/preferences");
  });

  it('should have the "secondary" color in light mode', () => {
    render(<ShopstrSwitch wotFilter={false} setWotFilter={mockSetWotFilter} />);

    const switchControl = screen.getByRole("switch");

    expect(switchControl).toHaveAttribute("data-color", "secondary");
  });

  it('should have the "warning" color in dark mode', () => {
    mockUseTheme.theme = "dark";
    render(<ShopstrSwitch wotFilter={false} setWotFilter={mockSetWotFilter} />);

    const switchControl = screen.getByRole("switch");

    expect(switchControl).toHaveAttribute("data-color", "warning");
  });
});
