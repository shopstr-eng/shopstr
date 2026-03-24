import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ZapsnagButton from "../ZapsnagButton";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import * as nostrHelpers from "@/utils/nostr/nostr-helper-functions";
import * as zapValidator from "@/utils/nostr/zap-validator";
import { LightningAddress } from "@getalby/lightning-tools";

jest.mock("@nextui-org/react", () => ({
  Button: ({
    onClick,
    children,
    isDisabled,
    isLoading,
    startContent,
    className,
  }: any) => (
    <button
      onClick={onClick}
      disabled={isDisabled || isLoading}
      className={className}
      data-testid={isLoading ? "loading-button" : "nextui-button"}
    >
      {startContent} {children}
    </button>
  ),
  Modal: ({ isOpen, children }: any) =>
    isOpen ? <div data-testid="modal">{children}</div> : null,
  ModalContent: ({ children }: any) => <div>{children}</div>,
  ModalHeader: ({ children }: any) => <h1>{children}</h1>,
  ModalBody: ({ children }: any) => <div>{children}</div>,
  Input: ({ label, value, onValueChange, placeholder }: any) => (
    <input
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    />
  ),
  useDisclosure: () => {
    const [isOpen, setIsOpen] = React.useState(false);
    return {
      isOpen,
      onOpen: () => setIsOpen(true),
      onClose: () => setIsOpen(false),
      onOpenChange: setIsOpen,
    };
  },
}));

jest.mock("@heroicons/react/24/outline", () => ({
  BoltIcon: () => <span data-testid="bolt-icon">⚡</span>,
}));

jest.mock("@getalby/lightning-tools", () => {
  return {
    LightningAddress: jest.fn().mockImplementation(() => ({
      fetch: jest.fn().mockResolvedValue(true),
      zap: jest.fn().mockResolvedValue({ preimage: "test-preimage" }),
    })),
  };
});

jest.mock("@getalby/sdk", () => ({
  webln: {
    NostrWebLNProvider: jest.fn().mockImplementation(() => ({
      enable: jest.fn().mockResolvedValue(true),
    })),
  },
}));

jest.mock("nostr-tools", () => ({
  generateSecretKey: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
  getPublicKey: jest.fn().mockReturnValue("ephemeral-pubkey-hex"),
}));

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  getLocalStorageData: jest.fn(),
  constructGiftWrappedEvent: jest.fn(),
  constructMessageSeal: jest.fn(),
  constructMessageGiftWrap: jest.fn(),
  sendGiftWrappedMessageEvent: jest.fn(),
}));

jest.mock("@/utils/nostr/zap-validator", () => ({
  validateZapReceipt: jest.fn(),
}));

Object.defineProperty(global, "crypto", {
  value: {
    randomUUID: () => "1234-order-id",
  },
});

const mockProduct = {
  id: "item-123",
  title: "Test Product",
  price: 100,
  pubkey: "seller-pubkey",
  images: [],
  description: "desc",
  createdAt: 1630000000,
  summary: "Test Summary",
  publishedAt: "1630000000",
  categories: [],
  location: "Internet",
  currency: "sats",
  totalCost: 100,
};

const mockSigner = { signEvent: jest.fn() };
const mockNostrManager = { fetch: jest.fn() };

const renderComponent = (contextOverrides = {}) => {
  const defaultContext = {
    nostrContext: { nostr: mockNostrManager },
    signerContext: {
      signer: mockSigner,
      isLoggedIn: true,
      pubkey: "buyer-pubkey",
    },
    ...contextOverrides,
  };

  return render(
    <NostrContext.Provider value={defaultContext.nostrContext as any}>
      <SignerContext.Provider value={defaultContext.signerContext as any}>
        <ZapsnagButton product={mockProduct} />
      </SignerContext.Provider>
    </NostrContext.Provider>
  );
};

describe("ZapsnagButton Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = jest.fn();

    Storage.prototype.getItem = jest.fn(() => null);
    Storage.prototype.setItem = jest.fn();

    (nostrHelpers.getLocalStorageData as jest.Mock).mockReturnValue({
      nwcString: null,
      relays: ["wss://relay.test"],
    });

    (window as any).webln = {
      enable: jest.fn().mockResolvedValue(true),
      sendPayment: jest.fn(),
    };
  });

  test("renders the button with correct price", () => {
    renderComponent();
    expect(screen.getByText(/Zap to Buy/i)).toBeInTheDocument();
    expect(screen.getByText(/100 sats/i)).toBeInTheDocument();
  });

  test("opens modal when clicked", () => {
    renderComponent();
    fireEvent.click(screen.getByText(/Zap to Buy/i));
    expect(screen.getByText(/Zapsnag: Test Product/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
  });

  test("pre-fills form from localStorage if available", () => {
    const savedInfo = {
      name: "John Doe",
      address: "123 Main St",
      city: "Bitcoin City",
      state: "BTC",
      zip: "21000",
      country: "El Salvador",
    };
    (localStorage.getItem as jest.Mock).mockReturnValue(
      JSON.stringify(savedInfo)
    );

    renderComponent();
    fireEvent.click(screen.getByText(/Zap to Buy/i));

    expect((screen.getByLabelText("Full Name") as HTMLInputElement).value).toBe(
      "John Doe"
    );
    expect((screen.getByLabelText("City") as HTMLInputElement).value).toBe(
      "Bitcoin City"
    );
  });

  test("disables confirm button if form is invalid", () => {
    renderComponent();
    fireEvent.click(screen.getByText(/Zap to Buy/i));

    const confirmBtn = screen.getByText("Confirm & Zap").closest("button");
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Full Name"), {
      target: { value: "User" },
    });
    expect(confirmBtn).toBeDisabled();
  });

  test("enables confirm button when form is valid", () => {
    renderComponent();
    fireEvent.click(screen.getByText(/Zap to Buy/i));

    fireEvent.change(screen.getByLabelText("Full Name"), {
      target: { value: "User" },
    });
    fireEvent.change(screen.getByLabelText("Street Address"), {
      target: { value: "123 St" },
    });
    fireEvent.change(screen.getByLabelText("City"), {
      target: { value: "City" },
    });
    fireEvent.change(screen.getByLabelText("Postal / Zip Code"), {
      target: { value: "00000" },
    });
    fireEvent.change(screen.getByLabelText("Country"), {
      target: { value: "US" },
    });

    const confirmBtn = screen.getByText("Confirm & Zap").closest("button");
    expect(confirmBtn).not.toBeDisabled();
  });

  test("shows alert if user is not logged in", () => {
    renderComponent({
      signerContext: { isLoggedIn: false, signer: null, pubkey: null },
    });

    fireEvent.click(screen.getByText(/Zap to Buy/i));

    fireEvent.change(screen.getByLabelText("Full Name"), {
      target: { value: "User" },
    });
    fireEvent.change(screen.getByLabelText("Street Address"), {
      target: { value: "123 St" },
    });
    fireEvent.change(screen.getByLabelText("City"), {
      target: { value: "City" },
    });
    fireEvent.change(screen.getByLabelText("Postal / Zip Code"), {
      target: { value: "00000" },
    });
    fireEvent.change(screen.getByLabelText("Country"), {
      target: { value: "US" },
    });

    fireEvent.click(screen.getByText("Confirm & Zap"));

    expect(window.alert).toHaveBeenCalledWith("Please sign in to purchase.");
  });

  test("handles full purchase flow successfully", async () => {
    mockNostrManager.fetch.mockResolvedValue([
      {
        created_at: 100,
        content: JSON.stringify({ lud16: "seller@alby.com" }),
      },
    ]);

    (zapValidator.validateZapReceipt as jest.Mock).mockResolvedValue(true);

    renderComponent();

    fireEvent.click(screen.getByText(/Zap to Buy/i));
    fireEvent.change(screen.getByLabelText("Full Name"), {
      target: { value: "Buyer" },
    });
    fireEvent.change(screen.getByLabelText("Street Address"), {
      target: { value: "Road" },
    });
    fireEvent.change(screen.getByLabelText("City"), {
      target: { value: "Town" },
    });
    fireEvent.change(screen.getByLabelText("Postal / Zip Code"), {
      target: { value: "123" },
    });
    fireEvent.change(screen.getByLabelText("Country"), {
      target: { value: "US" },
    });

    const confirmBtn = screen.getByText("Confirm & Zap");
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(mockNostrManager.fetch).toHaveBeenCalled();

    expect(nostrHelpers.constructGiftWrappedEvent).toHaveBeenCalledWith(
      "buyer-pubkey",
      "seller-pubkey",
      expect.stringContaining("zapsnag_order"),
      "zapsnag-order",
      expect.objectContaining({ isOrder: true })
    );
    expect(nostrHelpers.sendGiftWrappedMessageEvent).toHaveBeenCalled();

    expect(LightningAddress).toHaveBeenCalledWith("seller@alby.com");
    const mockLnInstance = (LightningAddress as unknown as jest.Mock).mock
      .results[0]!.value;
    expect(mockLnInstance.zap).toHaveBeenCalledWith(
      expect.objectContaining({
        satoshi: 100,
        comment: expect.stringContaining("Order #1234-order-id"),
      })
    );

    expect(zapValidator.validateZapReceipt).toHaveBeenCalled();

    expect(localStorage.setItem).toHaveBeenCalledWith(
      "milk_market_shipping_info",
      expect.any(String)
    );
    expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining("Order Placed & Verified")
    );
  });

  test("handles error if seller has no LUD16", async () => {
    mockNostrManager.fetch.mockResolvedValue([
      { created_at: 100, content: JSON.stringify({ name: "Just a name" }) },
    ]);

    renderComponent();
    fireEvent.click(screen.getByText(/Zap to Buy/i));

    fireEvent.change(screen.getByLabelText("Full Name"), {
      target: { value: "Buyer" },
    });
    fireEvent.change(screen.getByLabelText("Street Address"), {
      target: { value: "Road" },
    });
    fireEvent.change(screen.getByLabelText("City"), {
      target: { value: "Town" },
    });
    fireEvent.change(screen.getByLabelText("Postal / Zip Code"), {
      target: { value: "123" },
    });
    fireEvent.change(screen.getByLabelText("Country"), {
      target: { value: "US" },
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Confirm & Zap"));
    });

    expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining("Seller has not set up a Lightning Address")
    );
  });

  test("handles NWC connection if nwcString exists", async () => {
    (nostrHelpers.getLocalStorageData as jest.Mock).mockReturnValue({
      nwcString: "nostr+walletconnect://...",
      relays: [],
    });

    mockNostrManager.fetch.mockResolvedValue([
      {
        created_at: 100,
        content: JSON.stringify({ lud16: "seller@alby.com" }),
      },
    ]);

    renderComponent();
    fireEvent.click(screen.getByText(/Zap to Buy/i));

    fireEvent.change(screen.getByLabelText("Full Name"), {
      target: { value: "A" },
    });
    fireEvent.change(screen.getByLabelText("Street Address"), {
      target: { value: "B" },
    });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "C" } });
    fireEvent.change(screen.getByLabelText("Postal / Zip Code"), {
      target: { value: "D" },
    });
    fireEvent.change(screen.getByLabelText("Country"), {
      target: { value: "E" },
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Confirm & Zap"));
    });

    expect(window.alert).not.toHaveBeenCalledWith(
      expect.stringContaining("No wallet connected")
    );
  });
});
