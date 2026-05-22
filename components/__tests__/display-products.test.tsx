import { render, screen, waitFor } from "@testing-library/react";
import DisplayProducts from "../display-products";
import {
  FollowsContext,
  ProductContext,
  ProfileMapContext,
} from "@/utils/context/context";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";

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
    }: {
      productData: { title: string };
    }) {
      return <div>{productData.title}</div>;
    }
);

jest.mock("../display-product-modal", () => () => null);
jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  deleteEvent: jest.fn(),
}));
jest.mock("@/utils/url-slugs", () => ({
  getListingSlug: jest.fn(),
}));

describe("DisplayProducts search filtering", () => {
  it("matches literal special characters in search queries", async () => {
    render(
      <SignerContext.Provider
        value={{ pubkey: "viewer-pubkey", isLoggedIn: true }}
      >
        <NostrContext.Provider value={{ nostr: {} as any }}>
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
                  totalEvents: 0,
                  isLoading: false,
                  setProductEvents: jest.fn(),
                  loadMoreProducts: jest.fn(),
                  refreshProducts: jest.fn(),
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
});
