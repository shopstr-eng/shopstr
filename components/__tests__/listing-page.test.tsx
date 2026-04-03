import { render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import ListingPage, {
  getServerSideProps,
} from "../../pages/listing/[[...productId]]";
import { ProductContext } from "@/utils/context/context";
import { NostrContext } from "@/components/utility-components/nostr-context-provider";
import {
  fetchProductByDTagAndPubkey,
  fetchProductByIdFromDb,
  fetchProductByTitleSlug,
} from "@/utils/db/db-service";
import { NostrEvent } from "@/utils/types/types";

jest.mock("next/router", () => ({ __esModule: true, useRouter: jest.fn() }));
jest.mock("nostr-tools", () => ({
  Event: {},
  nip19: {
    decode: jest.fn(),
    naddrEncode: jest.fn(() => "naddr1encoded"),
  },
}));
jest.mock("@/utils/db/db-service", () => ({
  fetchProductByDTagAndPubkey: jest.fn(),
  fetchProductByIdFromDb: jest.fn(),
  fetchProductByTitleSlug: jest.fn(),
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
const mockFetchProductByDTagAndPubkey =
  fetchProductByDTagAndPubkey as jest.Mock;
const mockFetchProductByIdFromDb = fetchProductByIdFromDb as jest.Mock;
const mockFetchProductByTitleSlug = fetchProductByTitleSlug as jest.Mock;

const baseEvent: NostrEvent = {
  id: "event-id",
  pubkey: "f".repeat(64),
  created_at: 1710000000,
  kind: 30402,
  tags: [
    ["d", "listing-d-tag"],
    ["title", "Cold Load Listing"],
    ["summary", "Loads from SSR props"],
    ["image", "https://example.com/listing.png"],
    ["price", "10", "USD"],
    ["shipping", "Free"],
    ["location", "Online"],
  ],
  content: "",
  sig: "signature",
};

describe("Listing page", () => {
  let routerState: {
    isReady: boolean;
    push: jest.Mock;
    replace: jest.Mock;
    query: { productId: string[] };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    routerState = {
      isReady: true,
      push: jest.fn(),
      replace: jest.fn(),
      query: { productId: ["cold-load-listing"] },
    };
    mockUseRouter.mockImplementation(() => routerState);
  });

  it("renders from the SSR-fetched product when product context is empty", () => {
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
          <ListingPage
            ogMeta={{
              title: "Shopstr Listing",
              description: "Check out this listing on Shopstr!",
              image: "/shopstr-2000x2000.png",
              url: "/listing/cold-load-listing",
            }}
            initialProductEvent={baseEvent}
          />
        </ProductContext.Provider>
      </NostrContext.Provider>
    );

    expect(screen.getByTestId("checkout-card")).toHaveTextContent(
      "Cold Load Listing"
    );
  });

  it("returns the initial product event for direct naddr requests", async () => {
    (nip19.decode as jest.Mock).mockReturnValue({
      type: "naddr",
      data: {
        identifier: "listing-d-tag",
        pubkey: baseEvent.pubkey,
      },
    });
    mockFetchProductByDTagAndPubkey.mockResolvedValue(baseEvent);

    const result = await getServerSideProps({
      query: { productId: ["naddr1testlisting"] },
    } as any);

    expect(mockFetchProductByDTagAndPubkey).toHaveBeenCalledWith(
      "listing-d-tag",
      baseEvent.pubkey
    );
    expect(mockFetchProductByIdFromDb).not.toHaveBeenCalled();
    expect(mockFetchProductByTitleSlug).not.toHaveBeenCalled();
    expect(result).toEqual({
      props: {
        ogMeta: expect.objectContaining({
          title: "Cold Load Listing",
          url: "/listing/naddr1testlisting",
        }),
        initialProductEvent: baseEvent,
      },
    });
  });

  it("clears stale listing state when the route changes to a different listing", async () => {
    const { rerender } = render(
      <NostrContext.Provider value={{ nostr: {} as any }}>
        <ProductContext.Provider
          value={{
            productEvents: [],
            isLoading: false,
            addNewlyCreatedProductEvent: jest.fn(),
            removeDeletedProductEvent: jest.fn(),
          }}
        >
          <ListingPage
            ogMeta={{
              title: "Shopstr Listing",
              description: "Check out this listing on Shopstr!",
              image: "/shopstr-2000x2000.png",
              url: "/listing/cold-load-listing",
            }}
            initialProductEvent={baseEvent}
          />
        </ProductContext.Provider>
      </NostrContext.Provider>
    );

    expect(screen.getByTestId("checkout-card")).toHaveTextContent(
      "Cold Load Listing"
    );

    routerState = {
      ...routerState,
      query: { productId: ["fresh-direct-load"] },
    };

    rerender(
      <NostrContext.Provider value={{ nostr: {} as any }}>
        <ProductContext.Provider
          value={{
            productEvents: [],
            isLoading: false,
            addNewlyCreatedProductEvent: jest.fn(),
            removeDeletedProductEvent: jest.fn(),
          }}
        >
          <ListingPage
            ogMeta={{
              title: "Shopstr Listing",
              description: "Check out this listing on Shopstr!",
              image: "/shopstr-2000x2000.png",
              url: "/listing/fresh-direct-load",
            }}
            initialProductEvent={null}
          />
        </ProductContext.Provider>
      </NostrContext.Provider>
    );

    await waitFor(() =>
      expect(screen.queryByTestId("checkout-card")).not.toBeInTheDocument()
    );

    expect(screen.queryByText("Cold Load Listing")).not.toBeInTheDocument();
  });
});
