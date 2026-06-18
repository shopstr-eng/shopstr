import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import StorefrontOrderConfirmation from "../storefront-order-confirmation";
import { ProductContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

const mockPush = jest.fn();

jest.mock("next/router", () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
  })),
}));

describe("StorefrontOrderConfirmation", () => {
  const productContextValue = {
    productEvents: [],
    isLoading: false,
    addNewlyCreatedProductEvent: jest.fn(),
    removeDeletedProductEvent: jest.fn(),
  };

  const signerContextValue = {
    signer: undefined,
    isLoggedIn: false,
    isAuthStateResolved: true,
    pubkey: "",
    npub: "",
    newSigner: {},
  };

  const baseProps = {
    colors: {
      primary: "#111111",
      secondary: "#222222",
      accent: "#333333",
      background: "#ffffff",
      text: "#000000",
    },
    shopName: "Test Shop",
    shopSlug: "test-shop",
    shopPubkey: "seller-pubkey",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("consumes orderSummary once and does not redirect under StrictMode", async () => {
    sessionStorage.setItem(
      "orderSummary",
      JSON.stringify({
        productTitle: "Coffee Beans",
        productImage: "https://example.com/coffee.png",
        amount: "2500",
        currency: "sats",
        paymentMethod: "lightning",
        orderId: "order_12345678",
      })
    );

    render(
      <React.StrictMode>
        <SignerContext.Provider value={signerContextValue as any}>
          <ProductContext.Provider value={productContextValue}>
            <StorefrontOrderConfirmation {...baseProps} />
          </ProductContext.Provider>
        </SignerContext.Provider>
      </React.StrictMode>
    );

    expect(await screen.findByText("Order Confirmed!")).toBeInTheDocument();

    await waitFor(() => {
      expect(sessionStorage.getItem("orderSummary")).toBeNull();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  test("redirects back to the shop when orderSummary is invalid", async () => {
    sessionStorage.setItem("orderSummary", "{invalid-json");

    render(
      <SignerContext.Provider value={signerContextValue as any}>
        <ProductContext.Provider value={productContextValue}>
          <StorefrontOrderConfirmation {...baseProps} />
        </ProductContext.Provider>
      </SignerContext.Provider>
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/shop/test-shop");
    });
  });
});
