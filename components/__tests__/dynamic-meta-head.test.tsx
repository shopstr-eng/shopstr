import React from "react";
import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import DynamicHead from "../dynamic-meta-head";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import parseTags from "@/utils/parsers/product-parser-functions";
import { NostrEvent, ShopProfile } from "@/utils/types/types";

jest.mock("next/head", () => {
  return {
    __esModule: true,
    default: ({ children }: { children: Array<React.ReactElement> }) => {
      return <>{children}</>;
    },
  };
});

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));
const mockUseRouter = useRouter as jest.Mock;

jest.mock("nostr-tools", () => ({
  nip19: {
    naddrEncode: jest.fn(),
    npubEncode: jest.fn(),
  },
}));
const mockNip19 = nip19 as jest.Mocked<typeof nip19>;

jest.mock("@/utils/parsers/product-parser-functions", () => ({
  __esModule: true,
  default: jest.fn(),
}));
const mockParseTags = parseTags as jest.Mock;

describe("DynamicHead", () => {
  const mockOrigin = "https://test.milk.market";

  const getMetaContent = (name: string) => {
    const element = document.querySelector(
      `meta[name="${name}"], meta[property="${name}"]`
    );
    return element?.getAttribute("content");
  };

  beforeAll(() => {
    Object.defineProperty(window, "location", {
      value: {
        origin: mockOrigin,
      },
      writable: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should render default meta tags for a generic page", async () => {
    mockUseRouter.mockReturnValue({ pathname: "/", query: {} });
    render(
      <DynamicHead
        productEvents={[]}
        shopEvents={new Map()}
        profileData={new Map()}
      />
    );
    await waitFor(() => {
      expect(document.title).toBe("Milk Market");
    });
  });

  describe("Shop Pages", () => {
    test("should render meta tags for a specific shop page when shop is found", async () => {
      const shopPubkey = "shop_pubkey_1";
      const shopNpub = "npub1shop";
      const shopEvents = new Map<string, ShopProfile>([
        [
          shopPubkey,
          {
            pubkey: shopPubkey,
            content: {
              name: "Nostr Goods",
              about: "The best goods on Nostr.",
              ui: { picture: "https://shop.com/logo.png" },
            },
          } as ShopProfile,
        ],
      ]);
      mockUseRouter.mockReturnValue({
        pathname: `/marketplace/${shopNpub}`,
        query: { npub: [shopNpub] },
      });
      mockNip19.npubEncode.mockReturnValue(shopNpub);
      render(
        <DynamicHead
          productEvents={[]}
          shopEvents={shopEvents}
          profileData={new Map()}
        />
      );
      await waitFor(() => expect(document.title).toBe("Nostr Goods Shop"));
    });

    test("should render fallback meta tags for a shop page when shop is not found", async () => {
      const shopNpub = "npub1shop_not_found";
      mockUseRouter.mockReturnValue({
        pathname: `/marketplace/${shopNpub}`,
        query: { npub: [shopNpub] },
      });
      render(
        <DynamicHead
          productEvents={[]}
          shopEvents={new Map()}
          profileData={new Map()}
        />
      );
      await waitFor(() => expect(document.title).toBe("Milk Market Shop"));
    });

    test("should render fallback tags if npub is missing from query", async () => {
      mockUseRouter.mockReturnValue({
        pathname: `/marketplace/npub`,
        query: {},
      });
      render(
        <DynamicHead
          productEvents={[]}
          shopEvents={new Map()}
          profileData={new Map()}
        />
      );
      await waitFor(() => expect(document.title).toBe("Milk Market Shop"));
      expect(getMetaContent("og:url")).toBe(
        `${mockOrigin}/marketplace/undefined`
      );
    });

    test("should use fallback image for a shop with picture set to null", async () => {
      const shopPubkey = "shop_pubkey_3";
      const shopNpub = "npub1nullpic";
      const shopEvents = new Map<string, ShopProfile>([
        [
          shopPubkey,
          {
            pubkey: shopPubkey,
            content: { name: "Test Shop", ui: { picture: null } },
          } as ShopProfile,
        ],
      ]);
      mockUseRouter.mockReturnValue({
        pathname: `/marketplace/${shopNpub}`,
        query: { npub: [shopNpub] },
      });
      mockNip19.npubEncode.mockReturnValue(shopNpub);
      render(
        <DynamicHead
          productEvents={[]}
          shopEvents={shopEvents}
          profileData={new Map()}
        />
      );
      await waitFor(() =>
        expect(getMetaContent("og:image")).toBe("/milk-market.png")
      );
    });
  });

  describe("Listing Pages", () => {
    const productId = "product_123";
    const productPubkey = "product_pubkey_1";
    const productEvent = {
      id: productId,
      pubkey: productPubkey,
      tags: [["d", "some_other_id"]],
      kind: 30402,
    } as NostrEvent;

    test("should find a product by event id if d tag does not match", async () => {
      const naddr = "naddr1product";
      mockUseRouter.mockReturnValue({
        pathname: `/listing/${productId}`,
        query: { productId: [productId] },
      });
      mockNip19.naddrEncode.mockReturnValue(naddr);
      mockParseTags.mockReturnValue({ title: "Found By ID" });
      render(
        <DynamicHead
          productEvents={[productEvent]}
          shopEvents={new Map()}
          profileData={new Map()}
        />
      );
      await waitFor(() => expect(document.title).toBe("Found By ID"));
    });

    test("should use fallback values for a parsed product with partial data", async () => {
      const naddr = "naddr1product";
      mockUseRouter.mockReturnValue({
        pathname: `/listing/${productId}`,
        query: { productId: [productId] },
      });
      mockNip19.naddrEncode.mockReturnValue(naddr);
      mockParseTags.mockReturnValue({ summary: "Only summary exists." });
      render(
        <DynamicHead
          productEvents={[productEvent]}
          shopEvents={new Map()}
          profileData={new Map()}
        />
      );
      await waitFor(() => expect(document.title).toBe("Milk Market Listing"));
      expect(getMetaContent("og:image")).toBe("/milk-market.png");
    });

    test("should render fallback tags for a listing when parsing fails", async () => {
      const naddr = "naddr1product";
      mockUseRouter.mockReturnValue({
        pathname: `/listing/${productId}`,
        query: { productId: [productId] },
      });
      mockNip19.naddrEncode.mockReturnValue(naddr);
      mockParseTags.mockReturnValue(null);
      render(
        <DynamicHead
          productEvents={[productEvent]}
          shopEvents={new Map()}
          profileData={new Map()}
        />
      );
      await waitFor(() => expect(document.title).toBe("Milk Market Listing"));
    });
  });
});
