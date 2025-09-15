import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ShopstrSpinner from "../shopstr-spinner";
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

describe("ShopstrSpinner", () => {
  it('should render with the "warning" color in dark mode', () => {
    mockedUseTheme.mockReturnValue({ theme: "dark" });

    render(<ShopstrSpinner />);

    const spinner = screen.getByTestId("spinner");
    expect(spinner).toHaveAttribute("data-color", "warning");
  });

  it('should render with the "secondary" color in light mode', () => {
    mockedUseTheme.mockReturnValue({ theme: "light" });

    render(<ShopstrSpinner />);

    const spinner = screen.getByTestId("spinner");
    expect(spinner).toHaveAttribute("data-color", "secondary");
  });
});
