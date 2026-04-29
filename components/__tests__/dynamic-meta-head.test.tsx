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

jest.mock("@/utils/parsers/product-parser-functions", () => ({
  __esModule: true,
  default: jest.fn(),
}));
const mockParseTags = parseTags as jest.Mock;

const shopPubkey = "1".repeat(64);
const fallbackShopPubkey = "2".repeat(64);
const productPubkey = "3".repeat(64);

describe("DynamicHead", () => {
  const getMetaContent = (name: string) => {
    const element = document.querySelector(
      `meta[name="${name}"], meta[property="${name}"]`
    );
    return element?.getAttribute("content");
  };

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
      expect(document.title).toBe(
        "Shopstr | Bitcoin-Native Nostr Marketplace | Shop Freely"
      );
    });
  });

  describe("Shop Pages", () => {
    test("should render meta tags for a specific shop page when shop is found", async () => {
      const shopNpub = nip19.npubEncode(shopPubkey);
      const shopEvents = new Map<string, ShopProfile>([
        [
          shopPubkey,
          {
            pubkey: shopPubkey,
            content: {
              name: "Nostr Goods",
              about: "The best goods on Nostr.",
              ui: {
                picture: "https://shop.com/logo.png",
                banner: "",
                theme: "",
                darkMode: false,
              },
              merchants: [],
            },
            created_at: 0,
          } as ShopProfile,
        ],
      ]);
      mockUseRouter.mockReturnValue({
        pathname: `/marketplace/${shopNpub}`,
        query: { npub: [shopNpub] },
      });
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
      const shopNpub = nip19.npubEncode(fallbackShopPubkey);
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
      await waitFor(() => expect(document.title).toBe("Shopstr Shop"));
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
      await waitFor(() =>
        expect(document.title).toBe(
          "Shopstr | Bitcoin-Native Nostr Marketplace | Shop Freely"
        )
      );
    });

    test("should use fallback image for a shop with picture set to null", async () => {
      const shopNpub = nip19.npubEncode(shopPubkey);
      const shopEvents = new Map<string, ShopProfile>([
        [
          shopPubkey,
          {
            pubkey: shopPubkey,
            content: {
              name: "Test Shop",
              about: "",
              ui: { picture: "", banner: "", theme: "", darkMode: false },
              merchants: [],
            },
            created_at: 0,
          } as ShopProfile,
        ],
      ]);
      mockUseRouter.mockReturnValue({
        pathname: `/marketplace/${shopNpub}`,
        query: { npub: [shopNpub] },
      });
      render(
        <DynamicHead
          productEvents={[]}
          shopEvents={shopEvents}
          profileData={new Map()}
        />
      );
      await waitFor(() =>
        expect(getMetaContent("og:image")).toBe(
          "https://shopstr.market/shopstr-2000x2000.png"
        )
      );
    });
  });

  describe("Listing Pages", () => {
    const productId = "product_123";
    const productEvent = {
      id: productId,
      pubkey: productPubkey,
      tags: [["d", "some_other_id"]],
      kind: 30402,
    } as NostrEvent;

    test("should find a product by event id if d tag does not match", async () => {
      mockUseRouter.mockReturnValue({
        pathname: `/listing/${productId}`,
        query: { productId: [productId] },
      });
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

    test("should resolve relay-hinted naddr routes from the matching listing identity", async () => {
      const relayHintedNaddr = nip19.naddrEncode({
        identifier: "some_other_id",
        pubkey: productPubkey,
        kind: 30402,
        relays: ["wss://relay.shopstr.example", "wss://relay-2.shopstr.example"],
      });
      mockUseRouter.mockReturnValue({
        pathname: `/listing/${relayHintedNaddr}`,
        query: { productId: [relayHintedNaddr] },
      });
      mockParseTags.mockReturnValue({ title: "Relay Hint Listing" });
      render(
        <DynamicHead
          productEvents={[productEvent]}
          shopEvents={new Map()}
          profileData={new Map()}
        />
      );
      await waitFor(() => expect(document.title).toBe("Relay Hint Listing"));
    });

    test("should use fallback values for a parsed product with partial data", async () => {
      mockUseRouter.mockReturnValue({
        pathname: `/listing/${productId}`,
        query: { productId: [productId] },
      });
      mockParseTags.mockReturnValue({ summary: "Only summary exists." });
      render(
        <DynamicHead
          productEvents={[productEvent]}
          shopEvents={new Map()}
          profileData={new Map()}
        />
      );
      await waitFor(() => expect(document.title).toBe("Shopstr Listing"));
      expect(getMetaContent("og:image")).toBe(
        "https://shopstr.market/shopstr-2000x2000.png"
      );
    });

    test("should render fallback tags for a listing when parsing fails", async () => {
      mockUseRouter.mockReturnValue({
        pathname: `/listing/${productId}`,
        query: { productId: [productId] },
      });
      mockParseTags.mockReturnValue(null);
      render(
        <DynamicHead
          productEvents={[productEvent]}
          shopEvents={new Map()}
          profileData={new Map()}
        />
      );
      await waitFor(() => expect(document.title).toBe("Shopstr Listing"));
    });
  });
});
