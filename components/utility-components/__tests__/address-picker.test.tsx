import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { ChangeEvent, Key, ReactNode } from "react";
import AddressPicker from "../address-picker";
import { SavedAddress } from "@/utils/types/types";

type SelectionKeys = "all" | Iterable<Key>;
type AccordionContextValue = {
  openKeys: Set<string>;
  toggle: (key: string) => void;
};
type ButtonMockProps = {
  onClick?: () => void;
  onPress?: () => void;
  children?: ReactNode;
  className?: string;
  title?: string;
  size?: string;
  variant?: string;
  color?: string;
};
type CardMockProps = {
  children?: ReactNode;
  className?: string;
  isPressable?: boolean;
  onPress?: () => void;
};
type InputMockProps = {
  label?: ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  isRequired?: boolean;
};
type RadioGroupMockProps = {
  onValueChange?: (value: string) => void;
  children?: ReactNode;
};
type ValueChildrenProps = {
  value?: string;
  children?: ReactNode;
};
type AccordionMockProps = {
  children?: ReactNode;
  selectedKeys?: SelectionKeys;
  defaultSelectedKeys?: SelectionKeys;
  onSelectionChange?: (keys: Set<string>) => void;
};
type AccordionItemMockProps = {
  title?: ReactNode;
  children?: ReactNode;
  startContent?: ReactNode;
  accordionItemKey?: string;
};
type AccordionInjectedProps = {
  accordionItemKey?: string;
};

const mockAddress: SavedAddress = {
  id: "addr-1",
  label: "Home",
  name: "Alice",
  address: "1 BTC Lane",
  city: "Bitcoinville",
  state: "CA",
  zip: "90210",
  country: "US",
  isDefault: true,
};

const mockAddress2: SavedAddress = {
  id: "addr-2",
  label: "Work",
  name: "Bob",
  address: "2 ETH Street",
  city: "Ethereum City",
  state: "TX",
  zip: "77001",
  country: "US",
  isDefault: false,
};

// Mock address helper functions
jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  getSavedAddresses: jest.fn().mockReturnValue([]),
  saveAddress: jest
    .fn()
    .mockImplementation((addr) => ({ ...addr, id: "new-id" })),
  deleteAddress: jest.fn(),
  setDefaultAddress: jest.fn(),
}));

// Minimal NextUI mocks
jest.mock("@heroui/react", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const AccordionContext = React.createContext<AccordionContextValue | null>(
    null
  );

  const normalizeKeys = (keys?: SelectionKeys) => {
    if (keys === "all") {
      return new Set(["address-picker"]);
    }

    return new Set(Array.from(keys || [], (key) => String(key)));
  };

  return {
    Button: ({
      onClick,
      children,
      className,
      title,
      size,
      variant,
      color,
      onPress,
    }: ButtonMockProps) => (
      <button
        onClick={onClick || onPress}
        className={className}
        title={title}
        data-size={size}
        data-variant={variant}
        data-color={color}
      >
        {children}
      </button>
    ),
    Card: ({ children, className, isPressable, onPress }: CardMockProps) => (
      <div className={className} onClick={isPressable ? onPress : undefined}>
        {children}
      </div>
    ),
    CardBody: ({
      children,
      className,
    }: Pick<CardMockProps, "children" | "className">) => (
      <div className={className}>{children}</div>
    ),
    Input: ({
      label,
      value,
      onValueChange,
      placeholder,
      isRequired,
    }: InputMockProps) => (
      <input
        aria-label={typeof label === "string" ? label : "input"}
        placeholder={placeholder}
        value={value || ""}
        onChange={(e) => onValueChange?.(e.target.value)}
        data-required={isRequired}
      />
    ),
    RadioGroup: ({ onValueChange, children }: RadioGroupMockProps) => (
      <div
        role="radiogroup"
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onValueChange?.(e.target.value)
        }
      >
        {children}
      </div>
    ),
    Radio: ({ value, children }: ValueChildrenProps) => (
      <label>
        <input type="radio" value={value} /> {children}
      </label>
    ),
    Chip: ({ children }: Pick<ValueChildrenProps, "children">) => (
      <span>{children}</span>
    ),
    Accordion: ({
      children,
      selectedKeys,
      defaultSelectedKeys,
      onSelectionChange,
    }: AccordionMockProps) => {
      const isControlled = selectedKeys !== undefined;
      const [internalKeys, setInternalKeys] = React.useState(() =>
        normalizeKeys(defaultSelectedKeys)
      );
      const openKeys = isControlled
        ? normalizeKeys(selectedKeys)
        : internalKeys;

      const toggle = (key: string) => {
        const nextKeys = new Set(openKeys);
        if (nextKeys.has(key)) {
          nextKeys.delete(key);
        } else {
          nextKeys.add(key);
        }

        if (!isControlled) {
          setInternalKeys(nextKeys);
        }

        onSelectionChange?.(nextKeys);
      };

      return (
        <AccordionContext.Provider value={{ openKeys, toggle }}>
          <div data-selected={JSON.stringify(Array.from(openKeys))}>
            {React.Children.map(children, (child) =>
              React.isValidElement<AccordionInjectedProps>(child)
                ? React.cloneElement(child, {
                    accordionItemKey: String(child.key ?? ""),
                  })
                : child
            )}
          </div>
        </AccordionContext.Provider>
      );
    },
    AccordionItem: ({
      title,
      children,
      startContent,
      accordionItemKey,
    }: AccordionItemMockProps) => {
      const context = React.useContext(AccordionContext);
      const itemKey = accordionItemKey ?? "";
      const isOpen = context?.openKeys.has(itemKey);

      return (
        <div>
          <button type="button" onClick={() => context?.toggle(itemKey)}>
            {startContent}
            {title}
          </button>
          {isOpen ? <div>{children}</div> : null}
        </div>
      );
    },
  };
});

jest.mock("@heroicons/react/24/outline", () => ({
  TrashIcon: () => <span>🗑</span>,
  StarIcon: () => <span>☆</span>,
}));

jest.mock("@heroicons/react/24/solid", () => ({
  StarIcon: () => <span>★</span>,
}));

jest.mock("@/utils/STATIC-VARIABLES", () => ({
  SHOPSTRBUTTONCLASSNAMES: "btn-class",
}));

import * as helpers from "@/utils/nostr/nostr-helper-functions";

describe("AddressPicker", () => {
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (helpers.getSavedAddresses as jest.Mock).mockReturnValue([]);
  });

  it("renders nothing when no addresses and not forceExpanded", () => {
    (helpers.getSavedAddresses as jest.Mock).mockReturnValue([]);
    const { container } = render(<AddressPicker onSelect={mockOnSelect} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders content when forceExpanded with no addresses", () => {
    (helpers.getSavedAddresses as jest.Mock).mockReturnValue([]);
    render(<AddressPicker onSelect={mockOnSelect} forceExpanded />);
    expect(screen.getByText("+ Add another address")).toBeInTheDocument();
  });

  it("renders saved address labels when addresses exist", () => {
    (helpers.getSavedAddresses as jest.Mock).mockReturnValue([mockAddress]);
    render(<AddressPicker onSelect={mockOnSelect} forceExpanded />);
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("renders management mode without radio selection UI", () => {
    (helpers.getSavedAddresses as jest.Mock).mockReturnValue([mockAddress]);
    render(
      <AddressPicker
        onSelect={mockOnSelect}
        forceExpanded
        autoSelect={false}
        selectable={false}
      />
    );

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("addr-1")).not.toBeInTheDocument();
  });

  it("reveals saved addresses when the cart accordion trigger is clicked", () => {
    (helpers.getSavedAddresses as jest.Mock).mockReturnValue([mockAddress]);
    render(<AddressPicker onSelect={mockOnSelect} autoSelect={false} />);

    expect(screen.queryByText("Home")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Use a saved address"));

    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("renders compact cart mode with view only actions", () => {
    (helpers.getSavedAddresses as jest.Mock).mockReturnValue([mockAddress]);
    render(
      <AddressPicker
        onSelect={mockOnSelect}
        autoSelect={false}
        compact
        allowInlineAdd={false}
      />
    );

    fireEvent.click(screen.getByText("Use a saved address"));

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByText("1 BTC Lane")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Home"));
    expect(mockOnSelect).toHaveBeenCalledWith(mockAddress);

    fireEvent.click(screen.getByText("View"));
    expect(screen.getByText("1 BTC Lane")).toBeInTheDocument();
  });

  it("selects an address by clicking its card content", () => {
    (helpers.getSavedAddresses as jest.Mock).mockReturnValue([
      mockAddress,
      mockAddress2,
    ]);
    render(
      <AddressPicker onSelect={mockOnSelect} autoSelect={false} forceExpanded />
    );

    fireEvent.click(screen.getByText("Work"));

    expect(mockOnSelect).toHaveBeenCalledWith(mockAddress2);
  });

  it("auto-selects default address and calls onSelect on mount when autoSelect=true", () => {
    (helpers.getSavedAddresses as jest.Mock).mockReturnValue([mockAddress]);
    render(<AddressPicker onSelect={mockOnSelect} autoSelect />);
    expect(mockOnSelect).toHaveBeenCalledWith(mockAddress);
  });

  it("does NOT call onSelect on mount when autoSelect=false", () => {
    (helpers.getSavedAddresses as jest.Mock).mockReturnValue([mockAddress]);
    render(
      <AddressPicker onSelect={mockOnSelect} autoSelect={false} forceExpanded />
    );
    expect(mockOnSelect).not.toHaveBeenCalled();
  });

  it("shows Add new address form when button clicked", () => {
    (helpers.getSavedAddresses as jest.Mock).mockReturnValue([]);
    render(<AddressPicker onSelect={mockOnSelect} forceExpanded />);
    fireEvent.click(screen.getByText("+ Add another address"));
    expect(screen.getByText("Add New Address")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("e.g. Home, Office")
    ).toBeInTheDocument();
  });

  it("shows inline error when saving new address with missing required fields", () => {
    (helpers.getSavedAddresses as jest.Mock).mockReturnValue([]);
    render(<AddressPicker onSelect={mockOnSelect} forceExpanded />);
    fireEvent.click(screen.getByText("+ Add another address"));
    fireEvent.click(screen.getByText("Save & Use"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please fill out all required fields."
    );
  });

  it("calls saveAddress and onSelect when valid new address is saved", async () => {
    (helpers.getSavedAddresses as jest.Mock)
      .mockReturnValueOnce([]) // first getSavedAddresses call
      .mockReturnValue([{ ...mockAddress2, id: "new-id", isDefault: true }]); // after save

    render(<AddressPicker onSelect={mockOnSelect} forceExpanded />);
    fireEvent.click(screen.getByText("+ Add another address"));

    fireEvent.change(screen.getByPlaceholderText("e.g. Home, Office"), {
      target: { value: "Work" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { hidden: true, name: "Full Name" }),
      { target: { value: "Bob" } }
    );
    fireEvent.change(
      screen.getByRole("textbox", { hidden: true, name: "Street Address" }),
      { target: { value: "2 ETH St" } }
    );
    fireEvent.change(
      screen.getByRole("textbox", { hidden: true, name: "City" }),
      { target: { value: "City" } }
    );
    fireEvent.change(
      screen.getByRole("textbox", { hidden: true, name: "State" }),
      { target: { value: "TX" } }
    );
    fireEvent.change(
      screen.getByRole("textbox", { hidden: true, name: "Zip/Postal" }),
      { target: { value: "12345" } }
    );
    fireEvent.change(
      screen.getByRole("textbox", { hidden: true, name: "Country" }),
      { target: { value: "US" } }
    );

    fireEvent.click(screen.getByText("Save & Use"));

    await waitFor(() => {
      expect(helpers.saveAddress).toHaveBeenCalled();
    });
    expect(mockOnSelect).toHaveBeenCalled();
  });

  it("calls deleteAddress when trash icon is clicked", () => {
    (helpers.getSavedAddresses as jest.Mock).mockReturnValue([mockAddress]);
    render(<AddressPicker onSelect={mockOnSelect} forceExpanded />);
    fireEvent.click(screen.getByTitle("Delete address"));
    expect(helpers.deleteAddress).toHaveBeenCalledWith("addr-1");
  });

  it("calls setDefaultAddress when star icon is clicked", () => {
    (helpers.getSavedAddresses as jest.Mock).mockReturnValue([
      mockAddress,
      mockAddress2,
    ]);
    render(<AddressPicker onSelect={mockOnSelect} forceExpanded />);
    const starBtns = screen.getAllByTitle("Set as default");
    fireEvent.click(starBtns[1]!); // click second address star
    expect(helpers.setDefaultAddress).toHaveBeenCalledWith("addr-2");
  });
});
