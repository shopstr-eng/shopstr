import { render, screen } from "@testing-library/react";
import CountryDropdown from "../country-dropdown";
import { Select, SelectItem } from "@nextui-org/react";

jest.mock("../../../../public/locationSelection.json", () => ({
  countries: [
    { country: "India" },
    { country: "United States" },
    { country: "Canada" },
  ],
}));

jest.mock("@nextui-org/react", () => {
  const originalModule = jest.requireActual("@nextui-org/react");
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

    expect(MockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Country",
        placeholder: "Select a country",
      }),
      expect.anything()
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

    expect(MockSelectItem).toHaveBeenCalledWith(
      expect.objectContaining({
        value: "India",
        children: "India",
      }),
      expect.anything()
    );

    expect(MockSelectItem).toHaveBeenCalledWith(
      expect.objectContaining({
        value: "United States",
        children: "United States",
      }),
      expect.anything()
    );

    expect(MockSelectItem).toHaveBeenCalledWith(
      expect.objectContaining({
        value: "Canada",
        children: "Canada",
      }),
      expect.anything()
    );
  });
});
