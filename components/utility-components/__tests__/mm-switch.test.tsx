import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import MilkMarketSwitch from "../mm-switch";

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

jest.mock("@nextui-org/react", () => ({
  Switch: (props: { onClick: () => void; color: string }) => (
    <button role="switch" onClick={props.onClick} data-color={props.color} />
  ),
}));

describe("MilkMarketSwitch", () => {
  const mockSetWotFilter = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTheme.theme = "light";
  });

  it("should call setWotFilter with the inverted value when clicked", () => {
    render(
      <MilkMarketSwitch wotFilter={false} setWotFilter={mockSetWotFilter} />
    );
    const switchControl = screen.getByRole("switch");

    fireEvent.click(switchControl);

    expect(mockSetWotFilter).toHaveBeenCalledWith(true);
  });

  it("should call router.push when the 'Trust' label is clicked", () => {
    render(
      <MilkMarketSwitch wotFilter={false} setWotFilter={mockSetWotFilter} />
    );
    const trustLabel = screen.getByText("Trust");

    fireEvent.click(trustLabel);

    expect(mockRouterPush).toHaveBeenCalledWith("/settings/preferences");
  });

  it('should have the "secondary" color in light mode', () => {
    render(
      <MilkMarketSwitch wotFilter={false} setWotFilter={mockSetWotFilter} />
    );

    const switchControl = screen.getByRole("switch");

    expect(switchControl).toHaveAttribute("data-color", "secondary");
  });

  it('should have the "warning" color in dark mode', () => {
    mockUseTheme.theme = "dark";
    render(
      <MilkMarketSwitch wotFilter={false} setWotFilter={mockSetWotFilter} />
    );

    const switchControl = screen.getByRole("switch");

    expect(switchControl).toHaveAttribute("data-color", "warning");
  });
});
