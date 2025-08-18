import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import VolumeSelector from "../volume-selector";

const mockOnSelectionChange = jest.fn();
jest.mock("@nextui-org/react", () => ({
  Select: (props: any) => {
    mockOnSelectionChange.mockImplementation((keys) => props.onSelectionChange(keys));
    return (
      <div data-testid="select" data-selected-keys={JSON.stringify(Array.from(props.selectedKeys))}>
        {props.children}
      </div>
    );
  },
  SelectSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, textValue }: { children: React.ReactNode, textValue: string }) => (
    <div role="option">{textValue || children}</div>
  ),
}));

describe("VolumeSelector", () => {
  const mockOnVolumeChange = jest.fn();
  const defaultProps = {
    volumes: ["Small", "Medium", "Large"],
    volumePrices: new Map([
      ["Small", 100],
      ["Medium", 200],
      ["Large", 300],
    ]),
    currency: "SATS",
    selectedVolume: "Medium",
    onVolumeChange: mockOnVolumeChange,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render null if no volumes are provided", () => {
    const { container } = render(<VolumeSelector {...defaultProps} volumes={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("should render all volumes with their correct prices and currency", () => {
    render(<VolumeSelector {...defaultProps} />);
    expect(screen.getByText("Small - 100 SATS")).toBeInTheDocument();
    expect(screen.getByText("Medium - 200 SATS")).toBeInTheDocument();
    expect(screen.getByText("Large - 300 SATS")).toBeInTheDocument();
  });

  it("should correctly display the selected volume", () => {
    render(<VolumeSelector {...defaultProps} selectedVolume="Large" />);
    const select = screen.getByTestId("select");
    const selectedKeys = JSON.parse(select.getAttribute("data-selected-keys")!);
    expect(selectedKeys).toEqual(["Large"]);
  });

  it("should render a price of 0 if a volume is not in the prices map", () => {
    const propsWithMissingPrice = {
      ...defaultProps,
      volumes: ["Small", "Extra Large"],
      volumePrices: new Map([["Small", 100]]), 
    };
    render(<VolumeSelector {...propsWithMissingPrice} />);
    expect(screen.getByText("Extra Large - 0 SATS")).toBeInTheDocument();
  });

  it("should call onVolumeChange with the new volume when a selection is made", () => {
    render(<VolumeSelector {...defaultProps} />);
    
    mockOnSelectionChange(new Set(["Large"]));

    expect(mockOnVolumeChange).toHaveBeenCalledWith("Large");
    expect(mockOnVolumeChange).toHaveBeenCalledTimes(1);
  });

  it("should handle an empty selection without calling onVolumeChange", () => {
    render(<VolumeSelector {...defaultProps} />);
    
    mockOnSelectionChange(new Set());

    expect(mockOnVolumeChange).not.toHaveBeenCalled();
  });
});