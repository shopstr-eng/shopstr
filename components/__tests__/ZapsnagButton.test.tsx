import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ZapsnagButton from "@/components/ZapsnagButton";
import { NostrContext, SignerContext } from "@/components/utility-components/nostr-context-provider";
import * as nostrHelpers from "@/utils/nostr/nostr-helper-functions";
import { validateZapReceipt } from "@/utils/nostr/zap-validator";
import { LightningAddress } from "@getalby/lightning-tools";

jest.mock("@nextui-org/react", () => ({
  ...jest.requireActual("@nextui-org/react"),
  Modal: ({ isOpen, children }: any) => (isOpen ? <div>{children}</div> : null),
  ModalContent: ({ children }: any) => <div>{children}</div>,
  ModalHeader: ({ children }: any) => <div>{children}</div>,
  ModalBody: ({ children }: any) => <div>{children}</div>,
  useDisclosure: () => {
    const [isOpen, setIsOpen] = React.useState(false);
    return { isOpen, onOpen: () => setIsOpen(true), onClose: () => setIsOpen(false) };
  },
}));

jest.mock("@getalby/lightning-tools");
jest.mock("@getalby/sdk", () => ({
  webln: {
    NostrWebLNProvider: jest.fn().mockImplementation(() => ({
      enable: jest.fn(),
    })),
  },
}));
jest.mock("nostr-tools", () => ({
  generateSecretKey: jest.fn(() => new Uint8Array([1, 2, 3])),
  getPublicKey: jest.fn(() => "mockEphemeralPubkey"),
}));

jest.mock("@/utils/nostr/nostr-helper-functions");
jest.mock("@/utils/nostr/zap-validator");

Object.defineProperty(window, "crypto", {
  value: { randomUUID: () => "mock-uuid-1234" },
});

const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => (store[key] = value),
    clear: () => (store = {}),
  };
})();
Object.defineProperty(window, "localStorage", { value: mockLocalStorage });

const mockProduct = {
  id: "item-123",
  title: "Orange Pill",
  price: 100,
  pubkey: "seller-pubkey-123",
} as any;

const mockNostrManager = {
  fetch: jest.fn(),
  publish: jest.fn(),
};

const mockSigner = {
  signEvent: jest.fn(),
};

const TestWrapper = ({ children, isLoggedIn = true }: { children: React.ReactNode; isLoggedIn?: boolean }) => (
  <NostrContext.Provider value={{ nostr: mockNostrManager } as any}>
    <SignerContext.Provider
      value={{
        signer: mockSigner,
        isLoggedIn: isLoggedIn,
        pubkey: "buyer-pubkey-abc",
      } as any}
    >
      {children}
    </SignerContext.Provider>
  </NostrContext.Provider>
);

describe("ZapsnagButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    (nostrHelpers.getLocalStorageData as jest.Mock).mockReturnValue({
      nwcString: null,
      relays: [],
    });
    
    jest.spyOn(window, "alert").mockImplementation(() => {});
  });

  it("renders the button with correct price", () => {
    render(
      <TestWrapper>
        <ZapsnagButton product={mockProduct} />
      </TestWrapper>
    );
    expect(screen.getByText(/Zap to Buy \(100 sats\)/i)).toBeInTheDocument();
  });

  it("opens the modal when clicked", async () => {
    render(
      <TestWrapper>
        <ZapsnagButton product={mockProduct} />
      </TestWrapper>
    );

    const button = screen.getByText(/Zap to Buy/i);
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(`⚡ Zapsnag: ${mockProduct.title}`)).toBeInTheDocument();
    });
  });

  it("alerts user if not signed in", () => {
    render(
      <TestWrapper isLoggedIn={false}>
        <ZapsnagButton product={mockProduct} />
      </TestWrapper>
    );

    const button = screen.getByText(/Zap to Buy/i);
    fireEvent.click(button);

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "Guest User" } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: "123 Test St" } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: "Test City" } });
    fireEvent.change(screen.getByLabelText(/Postal \/ Zip Code/i), { target: { value: "12345" } });
    fireEvent.change(screen.getByLabelText(/Country/i), { target: { value: "Testland" } });

    const confirmBtn = screen.getByText("Confirm & Zap");
    expect(confirmBtn).not.toBeDisabled(); 
    
    fireEvent.click(confirmBtn);

    expect(window.alert).toHaveBeenCalledWith("Please sign in to purchase.");
  });

  it("loads shipping info from local storage", async () => {
    mockLocalStorage.setItem(
      "shopstr_shipping_info",
      JSON.stringify({ name: "Saved User", address: "123 Saved St", city: "Saved City", zip: "000", country: "Saved" })
    );

    render(
      <TestWrapper>
        <ZapsnagButton product={mockProduct} />
      </TestWrapper>
    );

    fireEvent.click(screen.getByText(/Zap to Buy/i));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Saved User")).toBeInTheDocument();
      expect(screen.getByDisplayValue("123 Saved St")).toBeInTheDocument();
    });
  });

  it("completes a successful purchase flow", async () => {
    const mockLnZap = jest.fn().mockResolvedValue({ preimage: "mock-preimage-123" });
    (LightningAddress as unknown as jest.Mock).mockImplementation(() => ({
      fetch: jest.fn(),
      zap: mockLnZap,
    }));

    (mockNostrManager.fetch as jest.Mock).mockResolvedValue([
      { created_at: 100, content: JSON.stringify({ lud16: "seller@stacker.news" }) }
    ]);

    (validateZapReceipt as jest.Mock).mockResolvedValue(true);
    
    const mockWebLnEnable = jest.fn();
    (window as any).webln = { enable: mockWebLnEnable };

    render(
      <TestWrapper>
        <ZapsnagButton product={mockProduct} />
      </TestWrapper>
    );

    fireEvent.click(screen.getByText(/Zap to Buy/i));

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "John Doe" } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: "123 Bit St" } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: "Citadel" } });
    fireEvent.change(screen.getByLabelText(/Postal \/ Zip Code/i), { target: { value: "21000" } });
    fireEvent.change(screen.getByLabelText(/Country/i), { target: { value: "El Salvador" } });

    const confirmBtn = screen.getByText("Confirm & Zap");
    fireEvent.click(confirmBtn);

    expect(await screen.findByText("Finding seller address...")).toBeInTheDocument();

    await waitFor(() => {
      expect(nostrHelpers.constructGiftWrappedEvent).toHaveBeenCalled();
      expect(nostrHelpers.sendGiftWrappedMessageEvent).toHaveBeenCalled();
      
      expect(mockLnZap).toHaveBeenCalledWith(expect.objectContaining({
        satoshi: 100,
        comment: "Order #mock-uuid-1234",
        e: "item-123"
      }));

      expect(validateZapReceipt).toHaveBeenCalled();

      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("Order Placed & Verified!"));
    });
  });

  it("handles failure when seller has no lightning address", async () => {
    (mockNostrManager.fetch as jest.Mock).mockResolvedValue([
      { created_at: 100, content: JSON.stringify({ about: "just a profile" }) }
    ]);
    (window as any).webln = { enable: jest.fn() };

    render(
      <TestWrapper>
        <ZapsnagButton product={mockProduct} />
      </TestWrapper>
    );

    fireEvent.click(screen.getByText(/Zap to Buy/i));
    
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText(/Street Address/i), { target: { value: "B" } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: "C" } });
    fireEvent.change(screen.getByLabelText(/Postal \/ Zip Code/i), { target: { value: "D" } });
    fireEvent.change(screen.getByLabelText(/Country/i), { target: { value: "E" } });

    fireEvent.click(screen.getByText("Confirm & Zap"));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith("Order failed: Seller has not set up a Lightning Address (LUD16).");
    });
  });
});