import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import WeightSelector from "../weight-selector";

const mockOnSelectionChange = jest.fn();
jest.mock("@heroui/react", () => ({
  Select: (props: any) => {
    mockOnSelectionChange.mockImplementation((keys) =>
      props.onSelectionChange(keys)
    );
    return (
      <div
        data-testid="select"
        data-selected-keys={JSON.stringify(Array.from(props.selectedKeys))}
      >
        {props.children}
      </div>
    );
  },
  SelectSection: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({
    children,
    textValue,
  }: {
    children: React.ReactNode;
    textValue: string;
  }) => <div role="option">{textValue || children}</div>,
}));

describe("WeightSelector", () => {
  const mockOnWeightChange = jest.fn();
  const defaultProps = {
    weights: ["1 oz", "8 oz", "1 lb"],
    weightPrices: new Map([
      ["1 oz", 100],
      ["8 oz", 600],
      ["1 lb", 1200],
    ]),
    currency: "SATS",
    selectedWeight: "8 oz",
    onWeightChange: mockOnWeightChange,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render null if no weights are provided", () => {
    const { container } = render(
      <WeightSelector {...defaultProps} weights={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("should render all weights with their correct prices and currency", () => {
    render(<WeightSelector {...defaultProps} />);
    expect(screen.getByText("1 oz - 100 SATS")).toBeInTheDocument();
    expect(screen.getByText("8 oz - 600 SATS")).toBeInTheDocument();
    expect(screen.getByText("1 lb - 1200 SATS")).toBeInTheDocument();
  });

  it("should correctly display the selected weight", () => {
    render(<WeightSelector {...defaultProps} selectedWeight="1 lb" />);
    const select = screen.getByTestId("select");
    const selectedKeys = JSON.parse(select.getAttribute("data-selected-keys")!);
    expect(selectedKeys).toEqual(["1 lb"]);
  });

  it("should render a price of 0 if a weight is not in the prices map", () => {
    const propsWithMissingPrice = {
      ...defaultProps,
      weights: ["1 oz", "5 lb"],
      weightPrices: new Map([["1 oz", 100]]),
    };
    render(<WeightSelector {...propsWithMissingPrice} />);
    expect(screen.getByText("5 lb - 0 SATS")).toBeInTheDocument();
  });

  it("should call onWeightChange with the new weight when a selection is made", () => {
    render(<WeightSelector {...defaultProps} />);

    mockOnSelectionChange(new Set(["1 lb"]));

    expect(mockOnWeightChange).toHaveBeenCalledWith("1 lb");
    expect(mockOnWeightChange).toHaveBeenCalledTimes(1);
  });

  it("should handle an empty selection without calling onWeightChange", () => {
    render(<WeightSelector {...defaultProps} />);

    mockOnSelectionChange(new Set());

    expect(mockOnWeightChange).not.toHaveBeenCalled();
  });
});
