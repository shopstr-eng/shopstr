import React, { ComponentProps } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useRouter } from "next/router";
import { ShopMapContext } from "@/utils/context/context";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@/utils/db/db-service", () => ({
  fetchShopPubkeyBySlug: jest.fn(),
  fetchShopProfileByPubkeyFromDb: jest.fn(),
}));

jest.mock("@/components/utility-components/shopstr-spinner", () => () => (
  <div data-testid="shop-spinner" />
));

jest.mock("@/components/storefront/storefront-layout", () => ({
  __esModule: true,
  default: ({
    shopPubkey,
    currentPage,
    initialSlug,
  }: {
    shopPubkey: string;
    currentPage?: string;
    initialSlug?: string;
  }) => (
    <div
      data-testid="storefront-layout"
      data-shop-pubkey={shopPubkey}
      data-current-page={currentPage || ""}
      data-initial-slug={initialSlug || ""}
    />
  ),
}));

import ShopPage from "../[slug]";
import ShopSubPage from "../[...shopPath]";

const mockUseRouter = useRouter as jest.Mock;
type ShopContextValue = ComponentProps<typeof ShopMapContext.Provider>["value"];

const renderWithShopContext = (
  ui: React.ReactElement,
  shopContextValue?: Partial<ShopContextValue>
) => {
  return render(
    <ShopMapContext.Provider
      value={{
        shopData: new Map(),
        isLoading: false,
        updateShopData: jest.fn(),
        ...shopContextValue,
      }}
    >
      {ui}
    </ShopMapContext.Provider>
  );
};

describe("shop route resolution", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      const slug = new URL(url, "https://shopstr.market").searchParams.get(
        "slug"
      );

      return Promise.resolve({
        ok: true,
        json: async () => ({
          pubkey: slug ? `${slug}-pubkey` : null,
          shopConfig: null,
          createdAt: null,
        }),
      });
    }) as jest.Mock;
  });

  afterEach(() => {
    (global.fetch as jest.Mock).mockRestore?.();
  });

  it("re-resolves /shop/[slug] when navigating to a different slug", async () => {
    mockUseRouter.mockReturnValue({ query: { slug: "alpha" } });

    const view = renderWithShopContext(<ShopPage />);

    expect(await screen.findByTestId("storefront-layout")).toHaveAttribute(
      "data-shop-pubkey",
      "alpha-pubkey"
    );

    mockUseRouter.mockReturnValue({ query: { slug: "beta" } });
    view.rerender(
      <ShopMapContext.Provider
        value={{
          shopData: new Map(),
          isLoading: false,
          updateShopData: jest.fn(),
        }}
      >
        <ShopPage />
      </ShopMapContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("storefront-layout")).toHaveAttribute(
        "data-shop-pubkey",
        "beta-pubkey"
      );
    });
  });

  it("re-resolves /shop/[...shopPath] when navigating between different shops", async () => {
    mockUseRouter.mockReturnValue({ query: { shopPath: ["alpha", "orders"] } });

    const view = renderWithShopContext(<ShopSubPage />);

    expect(await screen.findByTestId("storefront-layout")).toHaveAttribute(
      "data-shop-pubkey",
      "alpha-pubkey"
    );
    expect(screen.getByTestId("storefront-layout")).toHaveAttribute(
      "data-current-page",
      "orders"
    );

    mockUseRouter.mockReturnValue({ query: { shopPath: ["beta", "orders"] } });
    view.rerender(
      <ShopMapContext.Provider
        value={{
          shopData: new Map(),
          isLoading: false,
          updateShopData: jest.fn(),
        }}
      >
        <ShopSubPage />
      </ShopMapContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("storefront-layout")).toHaveAttribute(
        "data-shop-pubkey",
        "beta-pubkey"
      );
    });
  });
});
