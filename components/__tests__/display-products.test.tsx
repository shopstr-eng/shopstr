import { act, render, screen, waitFor } from "@testing-library/react";
import { useState, type Dispatch, type SetStateAction } from "react";
import DisplayProducts from "../display-products";
import {
  FollowsContext,
  ProductContext,
  ProfileMapContext,
  RelaysContext,
} from "@/utils/context/context";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { NostrEvent, NostrManager } from "@/utils/nostr/nostr-manager";

jest.mock("next/router", () => ({
  __esModule: true,
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    query: {},
    pathname: "/marketplace",
    asPath: "/marketplace",
  })),
}));

jest.mock(
  "../utility-components/product-card",
  () =>
    function MockProductCard({
      productData,
      href,
    }: {
      productData: { id: string; title: string };
      href?: string | null;
    }) {
      return href ? (
        <a data-testid={`product-${productData.id}`} href={href}>
          {productData.title}
        </a>
      ) : (
        <div data-testid={`product-${productData.id}`}>{productData.title}</div>
      );
    }
);

jest.mock("../display-product-modal", () => () => null);
jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  deleteEvent: jest.fn(),
}));
jest.mock("@/utils/db/db-client", () => ({
  cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/utils/url-slugs", () => ({
  getListingSlug: jest.fn((product: { id: string; title?: string }) =>
    product.title ? product.title.replace(/\s+/g, "-") : product.id
  ),
}));

const renderDisplayProducts = ({
  focusedPubkey,
  nostr,
  productEvents = [],
  relayList = ["wss://relay.example"],
  selectedSearch = "coffee",
  addNewlyCreatedProductEvent = jest.fn(),
  removeDeletedProductEvent = jest.fn(),
}: {
  focusedPubkey?: string;
  nostr: { fetch: jest.Mock };
  productEvents?: NostrEvent[];
  relayList?: string[];
  selectedSearch?: string;
  addNewlyCreatedProductEvent?: jest.Mock;
  removeDeletedProductEvent?: jest.Mock;
}) =>
  render(
    <SignerContext.Provider
      value={{ pubkey: "viewer-pubkey", isLoggedIn: true }}
    >
      <NostrContext.Provider
        value={{ nostr: nostr as unknown as NostrManager }}
      >
        <RelaysContext.Provider
          value={{
            relayList,
            readRelayList: [],
            writeRelayList: [],
            isLoading: false,
          }}
        >
          <ProfileMapContext.Provider
            value={{
              profileData: new Map(),
              isLoading: false,
              updateProfileData: jest.fn(),
            }}
          >
            <FollowsContext.Provider
              value={{
                followList: [],
                firstDegreeFollowsLength: 0,
                isLoading: false,
              }}
            >
              <ProductContext.Provider
                value={{
                  productEvents,
                  isLoading: false,
                  addNewlyCreatedProductEvent,
                  removeDeletedProductEvent,
                }}
              >
                <DisplayProducts
                  focusedPubkey={focusedPubkey}
                  selectedCategories={new Set()}
                  selectedLocation=""
                  selectedSearch={selectedSearch}
                />
              </ProductContext.Provider>
            </FollowsContext.Provider>
          </ProfileMapContext.Provider>
        </RelaysContext.Provider>
      </NostrContext.Provider>
    </SignerContext.Provider>
  );

describe("DisplayProducts search filtering", () => {
  it("matches literal special characters in search queries", async () => {
    render(
      <SignerContext.Provider
        value={{ pubkey: "viewer-pubkey", isLoggedIn: true }}
      >
        <NostrContext.Provider value={{ nostr: {} as unknown as NostrManager }}>
          <ProfileMapContext.Provider
            value={{
              profileData: new Map(),
              isLoading: false,
              updateProfileData: jest.fn(),
            }}
          >
            <FollowsContext.Provider
              value={{
                followList: [],
                firstDegreeFollowsLength: 0,
                isLoading: false,
              }}
            >
              <ProductContext.Provider
                value={{
                  productEvents: [
                    {
                      id: "product-1",
                      pubkey: "seller-pubkey",
                      created_at: 1,
                      kind: 30018,
                      tags: [
                        ["title", "C++ Guide"],
                        ["summary", "A beginner-friendly manual"],
                        ["price", "10", "USD"],
                        ["image", "https://example.com/guide.png"],
                      ],
                      content: "content",
                      sig: "sig",
                    },
                  ],
                  isLoading: false,
                  addNewlyCreatedProductEvent: jest.fn(),
                  removeDeletedProductEvent: jest.fn(),
                }}
              >
                <DisplayProducts
                  selectedCategories={new Set()}
                  selectedLocation=""
                  selectedSearch="c++"
                />
              </ProductContext.Provider>
            </FollowsContext.Provider>
          </ProfileMapContext.Provider>
        </NostrContext.Provider>
      </SignerContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText("C++ Guide")).toBeInTheDocument();
    });
  });

  it("shows marketplace listings returned by NIP-50 relay search", async () => {
    const nostr = {
      fetch: jest.fn().mockResolvedValue([
        {
          id: "relay-product-1",
          pubkey: "relay-seller",
          created_at: 10,
          kind: 30402,
          tags: [
            ["d", "relay-coffee"],
            ["title", "Relay Coffee Beans"],
            ["summary", "Fresh coffee discovered through relay search"],
            ["price", "12", "USD"],
            ["image", "https://example.com/coffee.png"],
          ],
          content: "Fresh coffee discovered through relay search",
          sig: "relay-sig",
        },
      ]),
    };

    render(
      <SignerContext.Provider
        value={{ pubkey: "viewer-pubkey", isLoggedIn: true }}
      >
        <NostrContext.Provider
          value={{ nostr: nostr as unknown as NostrManager }}
        >
          <RelaysContext.Provider
            value={{
              relayList: ["wss://relay.example"],
              readRelayList: [],
              writeRelayList: [],
              isLoading: false,
            }}
          >
            <ProfileMapContext.Provider
              value={{
                profileData: new Map(),
                isLoading: false,
                updateProfileData: jest.fn(),
              }}
            >
              <FollowsContext.Provider
                value={{
                  followList: [],
                  firstDegreeFollowsLength: 0,
                  isLoading: false,
                }}
              >
                <ProductContext.Provider
                  value={{
                    productEvents: [],
                    isLoading: false,
                    addNewlyCreatedProductEvent: jest.fn(),
                    removeDeletedProductEvent: jest.fn(),
                  }}
                >
                  <DisplayProducts
                    selectedCategories={new Set()}
                    selectedLocation=""
                    selectedSearch="coffee"
                  />
                </ProductContext.Provider>
              </FollowsContext.Provider>
            </ProfileMapContext.Provider>
          </RelaysContext.Provider>
        </NostrContext.Provider>
      </SignerContext.Provider>
    );

    await waitFor(() => {
      expect(nostr.fetch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ kinds: [30402], search: "coffee" }),
        ]),
        {},
        ["wss://relay.example"]
      );
      expect(screen.getByText("Relay Coffee Beans")).toBeInTheDocument();
    });
  });

  it("does not add transient NIP-50 search results to shared product context", async () => {
    const relayProduct = {
      id: "relay-product-1",
      pubkey: "relay-seller",
      created_at: 10,
      kind: 30402,
      tags: [
        ["d", "relay-coffee"],
        ["title", "Relay Coffee Beans"],
        ["price", "12", "USD"],
        ["image", "https://example.com/coffee.png"],
      ],
      content: "Fresh coffee discovered through relay search",
      sig: "relay-sig",
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayProduct]),
    };
    const addNewlyCreatedProductEvent = jest.fn();
    const removeDeletedProductEvent = jest.fn();

    renderDisplayProducts({
      nostr,
      addNewlyCreatedProductEvent,
      removeDeletedProductEvent,
    });

    await waitFor(() => {
      expect(screen.getByText("Relay Coffee Beans")).toBeInTheDocument();
    });
    expect(addNewlyCreatedProductEvent).not.toHaveBeenCalled();
    expect(removeDeletedProductEvent).not.toHaveBeenCalled();
  });

  it("scopes NIP-50 relay search to the focused seller when viewing a storefront", async () => {
    const sellerPubkey = "a".repeat(64);
    const nostr = {
      fetch: jest.fn().mockResolvedValue([
        {
          id: "seller-product",
          pubkey: sellerPubkey,
          created_at: 10,
          kind: 30402,
          tags: [
            ["d", "seller-coffee"],
            ["title", "Seller Coffee"],
            ["price", "12", "USD"],
            ["image", "https://example.com/seller-coffee.png"],
          ],
          content: "Fresh storefront coffee",
          sig: "relay-sig",
        },
      ]),
    };

    renderDisplayProducts({
      focusedPubkey: sellerPubkey,
      nostr,
    });

    await waitFor(() => {
      expect(nostr.fetch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            kinds: [30402],
            search: "coffee",
            authors: [sellerPubkey],
          }),
        ]),
        {},
        ["wss://relay.example"]
      );
      expect(screen.getByText("Seller Coffee")).toBeInTheDocument();
    });
  });

  it("does not run NIP-50 relay search for NIP-19 queries", async () => {
    const nostr = {
      fetch: jest.fn().mockResolvedValue([]),
    };

    renderDisplayProducts({
      nostr,
      selectedSearch: "naddr1invalid",
    });

    await waitFor(() => {
      expect(screen.getByText("No products found...")).toBeInTheDocument();
    });
    expect(nostr.fetch).not.toHaveBeenCalled();
  });

  it("shows zapsnag notes returned by NIP-50 relay search", async () => {
    const nostr = {
      fetch: jest.fn().mockResolvedValue([
        {
          id: "zapsnag-coffee",
          pubkey: "a".repeat(64),
          created_at: 10,
          kind: 1,
          tags: [["t", "shopstr-zapsnag"]],
          content:
            "Coffee beans price: 100 sats #zapsnag https://example.com/coffee.png",
          sig: "relay-sig",
        },
      ]),
    };

    renderDisplayProducts({ nostr });

    await waitFor(() => {
      expect(screen.getByText("Coffee beans")).toBeInTheDocument();
      expect(screen.getByTestId("product-zapsnag-coffee")).toHaveAttribute(
        "href",
        "/listing/zapsnag-coffee"
      );
    });
  });

  it("uses an exact naddr link for NIP-50-only listings with title collisions", async () => {
    const relaySeller = "a".repeat(64);
    const localSeller = "b".repeat(64);
    const relayProduct = {
      id: "relay-product-1",
      pubkey: relaySeller,
      created_at: 10,
      kind: 30402,
      tags: [
        ["d", "relay-coffee"],
        ["title", "Collision Coffee"],
        ["price", "12", "USD"],
        ["image", "https://example.com/relay-coffee.png"],
      ],
      content: "Relay-only collision coffee",
      sig: "relay-sig",
    };
    const localProduct = {
      id: "local-product-1",
      pubkey: localSeller,
      created_at: 9,
      kind: 30402,
      tags: [
        ["d", "local-coffee"],
        ["title", "Collision Coffee"],
        ["price", "10", "USD"],
        ["image", "https://example.com/local-coffee.png"],
      ],
      content: "Local collision coffee",
      sig: "local-sig",
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayProduct]),
    };

    renderDisplayProducts({
      nostr,
      productEvents: [localProduct],
    });

    await waitFor(() => {
      const relayLink = screen.getByTestId("product-relay-product-1");
      expect(relayLink.getAttribute("href")).toMatch(/^\/listing\/naddr1/);
      expect(relayLink.getAttribute("href")).not.toBe(
        "/listing/Collision-Coffee"
      );
    });
  });

  it("keeps an exact naddr link after product context receives the NIP-50 listing", async () => {
    const relayProduct = {
      id: "relay-product-1",
      pubkey: "a".repeat(64),
      created_at: 10,
      kind: 30402,
      tags: [
        ["d", "relay-coffee"],
        ["title", "Relay Coffee Beans"],
        ["price", "12", "USD"],
        ["image", "https://example.com/relay-coffee.png"],
      ],
      content: "Relay-only coffee",
      sig: "relay-sig",
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayProduct]),
    };
    let setContextProductEvents:
      | Dispatch<SetStateAction<NostrEvent[]>>
      | undefined;

    function StatefulDisplayProducts() {
      const [contextProductEvents, setProductEvents] = useState<NostrEvent[]>(
        []
      );
      setContextProductEvents = setProductEvents;

      return (
        <SignerContext.Provider
          value={{ pubkey: "viewer-pubkey", isLoggedIn: true }}
        >
          <NostrContext.Provider
            value={{ nostr: nostr as unknown as NostrManager }}
          >
            <RelaysContext.Provider
              value={{
                relayList: ["wss://relay.example"],
                readRelayList: [],
                writeRelayList: [],
                isLoading: false,
              }}
            >
              <ProfileMapContext.Provider
                value={{
                  profileData: new Map(),
                  isLoading: false,
                  updateProfileData: jest.fn(),
                }}
              >
                <FollowsContext.Provider
                  value={{
                    followList: [],
                    firstDegreeFollowsLength: 0,
                    isLoading: false,
                  }}
                >
                  <ProductContext.Provider
                    value={{
                      productEvents: contextProductEvents,
                      isLoading: false,
                      addNewlyCreatedProductEvent: jest.fn(),
                      removeDeletedProductEvent: jest.fn(),
                    }}
                  >
                    <DisplayProducts
                      selectedCategories={new Set()}
                      selectedLocation=""
                      selectedSearch="coffee"
                    />
                  </ProductContext.Provider>
                </FollowsContext.Provider>
              </ProfileMapContext.Provider>
            </RelaysContext.Provider>
          </NostrContext.Provider>
        </SignerContext.Provider>
      );
    }

    render(<StatefulDisplayProducts />);

    await waitFor(() => {
      expect(screen.getByTestId("product-relay-product-1")).toHaveAttribute(
        "href",
        expect.stringMatching(/^\/listing\/naddr1/)
      );
    });

    act(() => {
      setContextProductEvents?.([relayProduct as NostrEvent]);
    });

    await waitFor(() => {
      expect(screen.getByTestId("product-relay-product-1")).toHaveAttribute(
        "href",
        expect.stringMatching(/^\/listing\/naddr1/)
      );
      expect(screen.getByTestId("product-relay-product-1")).not.toHaveAttribute(
        "href",
        "/listing/Relay-Coffee-Beans"
      );
    });
  });

  it("keeps the newer local replaceable listing over a stale NIP-50 result", async () => {
    const sellerPubkey = "a".repeat(64);
    const staleRelayProduct = {
      id: "stale-product",
      pubkey: sellerPubkey,
      created_at: 10,
      kind: 30402,
      tags: [
        ["d", "coffee"],
        ["title", "Old Coffee"],
        ["price", "12", "USD"],
        ["image", "https://example.com/old-coffee.png"],
      ],
      content: "Coffee listing before update",
      sig: "stale-sig",
    };
    const newerLocalProduct = {
      ...staleRelayProduct,
      id: "newer-product",
      created_at: 20,
      tags: [
        ["d", "coffee"],
        ["title", "Updated Coffee"],
        ["price", "12", "USD"],
        ["image", "https://example.com/updated-coffee.png"],
      ],
      content: "Coffee listing after update",
      sig: "newer-sig",
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([staleRelayProduct]),
    };
    const addNewlyCreatedProductEvent = jest.fn();
    const removeDeletedProductEvent = jest.fn();

    renderDisplayProducts({
      nostr,
      productEvents: [newerLocalProduct],
      addNewlyCreatedProductEvent,
      removeDeletedProductEvent,
    });

    await waitFor(() => {
      expect(screen.getByText("Updated Coffee")).toBeInTheDocument();
      expect(screen.queryByText("Old Coffee")).not.toBeInTheDocument();
      expect(addNewlyCreatedProductEvent).not.toHaveBeenCalled();
      expect(removeDeletedProductEvent).not.toHaveBeenCalled();
    });
  });
});
