import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import ShopstrSwitch from "../shopstr-switch";

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
  __esModule: true,
  Switch: (props: {
    onValueChange: (value: boolean) => void;
    isSelected: boolean;
    color: string;
  }) => {
    const React = jest.requireActual("react");
    const [selected, setSelected] = React.useState(props.isSelected);

    React.useEffect(() => {
      setSelected(props.isSelected);
    }, [props.isSelected]);

    return (
      <button
        role="switch"
        aria-checked={selected}
        onClick={() => {
          const nextValue = !selected;
          setSelected(nextValue);
          props.onValueChange(nextValue);
        }}
        data-color={props.color}
      />
    );
  },
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

  it("should call router.push when the 'Trust' label is clicked", () => {
    render(<ShopstrSwitch wotFilter={false} setWotFilter={mockSetWotFilter} />);
    const trustLabel = screen.getByText("Trust");

    fireEvent.click(trustLabel);

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

  it("should toggle values across multiple clicks", () => {
    render(<ShopstrSwitch wotFilter={false} setWotFilter={mockSetWotFilter} />);
    const switchControl = screen.getByRole("switch");

    fireEvent.click(switchControl);
    fireEvent.click(switchControl);

    expect(mockSetWotFilter).toHaveBeenNthCalledWith(1, true);
    expect(mockSetWotFilter).toHaveBeenNthCalledWith(2, false);
    expect(switchControl).toHaveAttribute("aria-checked", "false");
  });
});
