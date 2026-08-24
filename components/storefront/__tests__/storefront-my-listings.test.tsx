import { render, screen } from "@testing-library/react";
import { ProductContext } from "@/utils/context/context";
import type { ProductContextInterface } from "@/utils/context/context";
import type { NostrEvent } from "@/utils/types/types";
import StorefrontMyListings from "../storefront-my-listings";

jest.mock(
  "@/components/utility-components/product-card",
  () =>
    function MockProductCard({
      productData,
    }: {
      productData: { id: string; title: string };
    }) {
      return (
        <div data-testid={`product-${productData.id}`}>{productData.title}</div>
      );
    }
);

const productEvent = (id: string, price: string): NostrEvent => ({
  id,
  pubkey: "seller",
  created_at: 1,
  kind: 30402,
  tags: [
    ["d", id],
    ["title", id],
    ["price", price, "USD"],
  ],
  content: "",
  sig: "signature",
});

describe("StorefrontMyListings", () => {
  it("hides seller listings with missing or invalid prices", () => {
    const productEvents = [
      productEvent("valid", "10"),
      productEvent("invalid", "not-a-number"),
      {
        ...productEvent("missing", "10"),
        tags: [["title", "missing"]],
      },
    ];
    const context: ProductContextInterface = {
      productEvents,
      isLoading: false,
      addNewlyCreatedProductEvent: jest.fn(),
      removeDeletedProductEvent: jest.fn(),
    };

    render(
      <ProductContext.Provider value={context}>
        <StorefrontMyListings
          shopPubkey="seller"
          colors={{
            primary: "#000000",
            secondary: "#000000",
            accent: "#000000",
            background: "#ffffff",
            text: "#000000",
          }}
        />
      </ProductContext.Provider>
    );

    expect(screen.getByTestId("product-valid")).toBeInTheDocument();
    expect(screen.queryByTestId("product-invalid")).not.toBeInTheDocument();
    expect(screen.queryByTestId("product-missing")).not.toBeInTheDocument();
  });
});
