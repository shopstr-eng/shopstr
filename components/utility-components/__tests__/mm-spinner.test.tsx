import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MilkMarketSpinner from "../mm-spinner";
import { useTheme } from "next-themes";

jest.mock("next-themes", () => ({
  useTheme: jest.fn(),
}));

jest.mock("@nextui-org/react", () => ({
  Spinner: (props: { color: string; size: string }) => (
    <div data-testid="spinner" data-color={props.color}></div>
  ),
}));

const mockedUseTheme = useTheme as jest.Mock;

describe("MilkMarketSpinner", () => {
  it('should render with the "warning" color in dark mode', () => {
    mockedUseTheme.mockReturnValue({ theme: "dark" });

    render(<MilkMarketSpinner />);

    const spinner = screen.getByTestId("spinner");
    expect(spinner).toHaveAttribute("data-color", "warning");
  });

  it('should render with the "secondary" color in light mode', () => {
    mockedUseTheme.mockReturnValue({ theme: "light" });

    render(<MilkMarketSpinner />);

    const spinner = screen.getByTestId("spinner");
    expect(spinner).toHaveAttribute("data-color", "secondary");
  });
});
