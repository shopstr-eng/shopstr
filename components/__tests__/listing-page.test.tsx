import { render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/router";
import ListingPage from "../../pages/listing/[[...productId]]";
import { ProductContext } from "@/utils/context/context";
import { NostrContext } from "@/components/utility-components/nostr-context-provider";
import { fetchProductByIdentifierFromRelays } from "@/utils/nostr/fetch-service";
import { NostrEvent } from "@/utils/types/types";

jest.mock("next/router", () => ({ __esModule: true, useRouter: jest.fn() }));
jest.mock("nostr-tools", () => ({
  Event: {},
  nip19: {
    decode: jest.fn(),
    naddrEncode: jest.fn(() => "naddr1encoded"),
  },
}));
jest.mock("@/utils/nostr/fetch-service", () => ({
  fetchProductByIdentifierFromRelays: jest.fn(),
}));
jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  getLocalStorageData: jest.fn(() => ({
    relays: ["wss://relay.one"],
    readRelays: [],
  })),
  getDefaultRelays: jest.fn(() => ["wss://relay.default"]),
}));
jest.mock(
  "@/components/storefront/storefront-theme-wrapper",
  () =>
    function MockStorefrontThemeWrapper({
      children,
    }: {
      children: any;
    }) {
      return <div data-testid="storefront-theme-wrapper">{children}</div>;
    }
);
jest.mock(
  "../../components/utility-components/checkout-card",
  () =>
    function MockCheckoutCard({ productData }: { productData: any }) {
      return <div data-testid="checkout-card">{productData.title}</div>;
    }
);
jest.mock(
  "../../components/utility-components/modals/event-modals",
  () => ({
    RawEventModal: () => null,
    EventIdModal: () => null,
  })
);

const mockUseRouter = useRouter as jest.Mock;
const mockFetchProductByIdentifierFromRelays =
  fetchProductByIdentifierFromRelays as jest.Mock;

const baseEvent: NostrEvent = {
  id: "event-id",
  pubkey: "f".repeat(64),
  created_at: 1710000000,
  kind: 30402,
  tags: [
    ["d", "listing-d-tag"],
    ["title", "Cold Load Listing"],
    ["summary", "Loads from relay fallback"],
    ["image", "https://example.com/listing.png"],
    ["price", "10", "USD"],
    ["shipping", "Free"],
    ["location", "Online"],
  ],
  content: "",
  sig: "signature",
};

const nextEvent: NostrEvent = {
  id: "next-event-id",
  pubkey: "e".repeat(64),
  created_at: 1710000100,
  kind: 30402,
  tags: [
    ["d", "fresh-direct-load"],
    ["title", "Fresh Direct Load"],
    ["summary", "Loads after a route change"],
    ["image", "https://example.com/fresh.png"],
    ["price", "20", "USD"],
    ["shipping", "Worldwide"],
    ["location", "Remote"],
  ],
  content: "",
  sig: "next-signature",
};

describe("Listing page relay fallback", () => {
  let routerState: {
    isReady: boolean;
    push: jest.Mock;
    replace: jest.Mock;
    query: { productId: string[] };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchProductByIdentifierFromRelays.mockResolvedValue(null);
    routerState = {
      isReady: true,
      push: jest.fn(),
      replace: jest.fn(),
      query: { productId: ["naddr1testlisting"] },
    };
    mockUseRouter.mockImplementation(() => routerState);
  });

  it("falls back to relay fetch when product context misses", async () => {
    mockFetchProductByIdentifierFromRelays.mockResolvedValue(baseEvent);

    render(
      <NostrContext.Provider value={{ nostr: {} as any }}>
        <ProductContext.Provider
          value={{
            productEvents: [],
            isLoading: false,
            addNewlyCreatedProductEvent: jest.fn(),
            removeDeletedProductEvent: jest.fn(),
          }}
        >
          <ListingPage />
        </ProductContext.Provider>
      </NostrContext.Provider>
    );

    expect(
      await screen.findByTestId("checkout-card")
    ).toHaveTextContent("Cold Load Listing");
    expect(mockFetchProductByIdentifierFromRelays).toHaveBeenCalledWith(
      expect.anything(),
      ["wss://relay.one"],
      "naddr1testlisting"
    );
  });

  it("clears stale listing state before fetching a new direct route", async () => {
    const addNewlyCreatedProductEvent = jest.fn();
    mockFetchProductByIdentifierFromRelays
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(nextEvent);
    routerState = {
      ...routerState,
      query: { productId: ["event-id"] },
    };

    const { rerender } = render(
      <NostrContext.Provider value={{ nostr: {} as any }}>
        <ProductContext.Provider
          value={{
            productEvents: [baseEvent],
            isLoading: false,
            addNewlyCreatedProductEvent,
            removeDeletedProductEvent: jest.fn(),
          }}
        >
          <ListingPage />
        </ProductContext.Provider>
      </NostrContext.Provider>
    );

    expect(await screen.findByTestId("checkout-card")).toHaveTextContent(
      "Cold Load Listing"
    );

    routerState = {
      ...routerState,
      query: { productId: ["naddr1freshlisting"] },
    };

    rerender(
      <NostrContext.Provider value={{ nostr: {} as any }}>
        <ProductContext.Provider
          value={{
            productEvents: [],
            isLoading: false,
            addNewlyCreatedProductEvent,
            removeDeletedProductEvent: jest.fn(),
          }}
        >
          <ListingPage />
        </ProductContext.Provider>
      </NostrContext.Provider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("checkout-card")).toHaveTextContent(
        "Fresh Direct Load"
      )
    );

    expect(screen.queryByText("Cold Load Listing")).not.toBeInTheDocument();
    expect(mockFetchProductByIdentifierFromRelays).toHaveBeenCalledWith(
      expect.anything(),
      ["wss://relay.one"],
      "naddr1freshlisting"
    );
    expect(addNewlyCreatedProductEvent).toHaveBeenCalledWith(nextEvent);
  });
});
