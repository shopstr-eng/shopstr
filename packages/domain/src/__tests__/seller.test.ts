import {
  buildSellerShopProfileContent,
  normalizeStorefrontSlug,
  parseSellerShopProfileEvent,
  selectSellerListingSummaries,
  validateStorefrontBasicsDraft,
} from "../index";

describe("seller domain helpers", () => {
  test("validates storefront basics draft fields", () => {
    expect(
      validateStorefrontBasicsDraft({
        shopName: "",
        about: "a".repeat(501),
        notificationEmail: "invalid-email",
        shopSlug: "!",
      })
    ).toEqual({
      shopName: "Shop name is required.",
      about: "About must be 500 characters or fewer.",
      notificationEmail: "Enter a valid email address.",
      shopSlug: "Shop slug must be at least 2 characters.",
    });
  });

  test("builds storefront content while preserving existing seller settings", () => {
    expect(
      buildSellerShopProfileContent({
        pubkey: "seller-pubkey",
        existingContent: {
          name: "Old Name",
          about: "Old about",
          ui: {
            picture: "https://example.com/logo.png",
            banner: "https://example.com/banner.png",
            theme: "olive",
            darkMode: false,
          },
          merchants: ["seller-pubkey"],
          freeShippingThreshold: 80,
          freeShippingCurrency: "USD",
          paymentMethodDiscounts: { cashu: 10 },
          storefront: {
            shopSlug: "old-slug",
          },
        },
        draft: {
          shopName: "Fresh Farm",
          about: "Grass-fed milk and cheese.",
          notificationEmail: "seller@example.com",
          shopSlug: " Fresh Farm!! ",
        },
      })
    ).toEqual({
      name: "Fresh Farm",
      about: "Grass-fed milk and cheese.",
      ui: {
        picture: "https://example.com/logo.png",
        banner: "https://example.com/banner.png",
        theme: "olive",
        darkMode: false,
      },
      merchants: ["seller-pubkey"],
      freeShippingThreshold: 80,
      freeShippingCurrency: "USD",
      paymentMethodDiscounts: { cashu: 10 },
      storefront: {
        shopSlug: "fresh-farm",
      },
    });
  });

  test("normalizes storefront slugs without leaving a trailing dash after truncation", () => {
    expect(normalizeStorefrontSlug(`${"a".repeat(62)}!!`)).toBe("a".repeat(62));
  });

  test("parses storefront config defensively from malformed profile content", () => {
    expect(
      parseSellerShopProfileEvent({
        id: "shop-event",
        pubkey: "seller-pubkey",
        created_at: 1710000000,
        kind: 30019,
        sig: "sig",
        tags: [["d", "seller-pubkey"]],
        content: JSON.stringify({
          name: "Fresh Farm",
          about: "Milk and cheese.",
          storefront: {
            shopSlug: "fresh-farm",
            productLayout: "grid",
            navLinks: [{ label: "Home", href: "/" }, { label: 2 }],
            footer: {
              text: "Footer text",
              navLinks: [{ label: "Shop", href: "/shop" }, { href: "/bad" }],
            },
            showWalletPage: "yes",
          },
        }),
      })
    ).toEqual(
      expect.objectContaining({
        content: expect.objectContaining({
          storefront: {
            shopSlug: "fresh-farm",
            productLayout: "grid",
            navLinks: [{ label: "Home", href: "/" }],
            footer: {
              text: "Footer text",
              navLinks: [{ label: "Shop", href: "/shop" }],
            },
          },
        }),
      })
    );
  });

  test("selects seller listing summaries from cached product events", () => {
    const summaries = selectSellerListingSummaries(
      [
        {
          id: "seller-listing",
          pubkey: "seller-pubkey",
          created_at: 1710000000,
          kind: 30402,
          content: "",
          tags: [
            ["title", "Creamline Milk"],
            ["status", "active"],
            ["price", "12.5", "USD"],
            ["t", "Milk"],
            ["t", "FREEMILK"],
            ["t", "Local"],
            ["d", "listing-1"],
          ],
        },
        {
          id: "other-listing",
          pubkey: "other-pubkey",
          created_at: 1711000000,
          kind: 30402,
          content: "",
          tags: [["title", "Ignore Me"]],
        },
      ],
      "seller-pubkey"
    );

    expect(summaries).toEqual([
      {
        id: "seller-listing",
        pubkey: "seller-pubkey",
        createdAt: 1710000000,
        title: "Creamline Milk",
        status: "active",
        price: 12.5,
        currency: "USD",
        categories: ["Milk", "Local"],
        primaryCategory: "Milk",
        dTag: "listing-1",
      },
    ]);
  });
});
