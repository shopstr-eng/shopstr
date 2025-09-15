import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import CompactCategories from "../compact-categories";

jest.mock("@/utils/STATIC-VARIABLES", () => ({
  CATEGORIES: ["Electronics", "Books", "Home & Kitchen", "Art"],
}));

jest.mock("@nextui-org/react", () => ({
  Chip: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chip">{children}</div>
  ),
  Tooltip: ({
    children,
    isDisabled,
  }: {
    children: React.ReactNode;
    isDisabled?: boolean;
  }) => (
    <div data-testid="tooltip" data-disabled={isDisabled}>
      {children}
    </div>
  ),
}));

describe("CompactCategories", () => {
  it("renders null if no categories are provided", () => {
    const { container } = render(<CompactCategories categories={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders null if all provided categories are invalid", () => {
    const { container } = render(
      <CompactCategories categories={["invalid1", "invalid2"]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders only a single chip if one valid category is provided", () => {
    render(<CompactCategories categories={["Books"]} />);
    const chip = screen.getByTestId("chip");
    expect(chip).toHaveTextContent("Books");
    expect(screen.queryByText(/,\s*\.\.\./)).not.toBeInTheDocument();
  });

  it("disables the tooltip when only one category is present", () => {
    render(<CompactCategories categories={["Books"]} />);
    const tooltip = screen.getByTestId("tooltip");
    expect(tooltip).toHaveAttribute("data-disabled", "true");
  });

  it("renders the longest category first with ellipsis for multiple categories", () => {
    render(<CompactCategories categories={["Art", "Electronics"]} />);
    const chip = screen.getByTestId("chip");
    expect(chip).toHaveTextContent("Electronics, ...");
  });

  it("enables the tooltip when multiple categories are present", () => {
    render(<CompactCategories categories={["Art", "Electronics"]} />);
    const tooltip = screen.getByTestId("tooltip");
    expect(tooltip).toHaveAttribute("data-disabled", "false");
  });

  it("filters out invalid categories and renders only the valid ones", () => {
    render(<CompactCategories categories={["Books", "invalid", "Art"]} />);
    const chip = screen.getByTestId("chip");
    expect(chip).toHaveTextContent("Books, ...");
  });

  it("updates the display on click to show only the primary category", () => {
    render(<CompactCategories categories={["Art", "Books"]} />);

    expect(screen.getByText(/,\s*\.\.\./)).toBeInTheDocument();

    const trigger = screen.getByTestId("chip").parentElement;
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger!);

    expect(screen.queryByText(/,\s*\.\.\./)).not.toBeInTheDocument();
  });
});
