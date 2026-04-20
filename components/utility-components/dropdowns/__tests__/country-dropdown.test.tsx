import { render, screen } from "@testing-library/react";
import CountryDropdown from "../country-dropdown";
import { Select, SelectItem } from "@heroui/react";

jest.mock("../../../../public/locationSelection.json", () => ({
  countries: [
    { country: "India" },
    { country: "United States" },
    { country: "Canada" },
  ],
}));

jest.mock("@heroui/react", () => {
  const originalModule = jest.requireActual("@heroui/react");
  return {
    ...originalModule,
    Select: jest.fn(({ children, _classNames, ...props }) => (
      <div {...props}>{children}</div>
    )),
    SelectSection: jest.fn(({ children, _classNames, ...props }) => (
      <div {...props}>{children}</div>
    )),
    SelectItem: jest.fn(({ children, _classNames, ...props }) => (
      <div {...props}>{children}</div>
    )),
  };
});

const MockSelect = Select as jest.Mock;
const MockSelectItem = SelectItem as jest.Mock;

describe("CountryDropdown", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render the select component with all passed props", () => {
    render(<CountryDropdown label="Country" placeholder="Select a country" />);

    expect(MockSelect).toHaveBeenCalled();
    expect(MockSelect.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        label: "Country",
        placeholder: "Select a country",
      })
    );
  });

  it("should render a list of countries from the mocked JSON file", () => {
    render(<CountryDropdown />);

    expect(MockSelectItem).toHaveBeenCalledTimes(3);
    expect(screen.getByText("India")).toBeInTheDocument();
    expect(screen.getByText("United States")).toBeInTheDocument();
    expect(screen.getByText("Canada")).toBeInTheDocument();
  });

  it("should pass the correct value and children props to each SelectItem", () => {
    render(<CountryDropdown />);

    const renderedLabels = MockSelectItem.mock.calls.map(
      ([props]) => props?.children
    );

    expect(renderedLabels).toEqual(
      expect.arrayContaining(["India", "United States", "Canada"])
    );
  });
});
