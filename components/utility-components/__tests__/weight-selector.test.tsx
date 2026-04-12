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
    weights: ["2oz", "4oz", "8oz"],
    weightPrices: new Map([
      ["2oz", 50],
      ["4oz", 90],
      ["8oz", 150],
    ]),
    currency: "SATS",
    selectedWeight: "4oz",
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
    expect(screen.getByText("2oz - 50 SATS")).toBeInTheDocument();
    expect(screen.getByText("4oz - 90 SATS")).toBeInTheDocument();
    expect(screen.getByText("8oz - 150 SATS")).toBeInTheDocument();
  });

  it("should correctly display the selected weight", () => {
    render(<WeightSelector {...defaultProps} selectedWeight="8oz" />);
    const select = screen.getByTestId("select");
    const selectedKeys = JSON.parse(select.getAttribute("data-selected-keys")!);
    expect(selectedKeys).toEqual(["8oz"]);
  });

  it("should render a price of 0 if a weight is not in the prices map", () => {
    const propsWithMissingPrice = {
      ...defaultProps,
      weights: ["2oz", "16oz"],
      weightPrices: new Map([["2oz", 50]]),
    };
    render(<WeightSelector {...propsWithMissingPrice} />);
    expect(screen.getByText("16oz - 0 SATS")).toBeInTheDocument();
  });

  it("should call onWeightChange with the new weight when a selection is made", () => {
    render(<WeightSelector {...defaultProps} />);

    mockOnSelectionChange(new Set(["8oz"]));

    expect(mockOnWeightChange).toHaveBeenCalledWith("8oz");
    expect(mockOnWeightChange).toHaveBeenCalledTimes(1);
  });

  it("should handle an empty selection without calling onWeightChange", () => {
    render(<WeightSelector {...defaultProps} />);

    mockOnSelectionChange(new Set());

    expect(mockOnWeightChange).not.toHaveBeenCalled();
  });
});
