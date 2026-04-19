import {
  isExternalStorefrontHref,
  sanitizeStorefrontConfigLinks,
  sanitizeStorefrontNavHref,
  sanitizeStorefrontSectionLink,
  sanitizeStorefrontSocialLink,
} from "@/utils/storefront-links";

describe("storefront link sanitization", () => {
  it("blocks javascript urls in section CTAs", () => {
    expect(sanitizeStorefrontSectionLink("javascript:alert(1)")).toBe(
      "#products"
    );
  });

  it("blocks javascript urls in social links", () => {
    expect(sanitizeStorefrontSocialLink("javascript:alert(1)")).toBe("#");
  });

  it("converts page nav links into shop-relative routes", () => {
    expect(
      sanitizeStorefrontNavHref(
        { label: "Orders", href: "orders", isPage: true },
        "securityshop"
      )
    ).toBe("/shop/securityshop/orders");
  });

  it("falls back when custom nav links use blocked schemes", () => {
    expect(
      sanitizeStorefrontNavHref(
        { label: "Malicious", href: "javascript:alert(1)" },
        "securityshop"
      )
    ).toBe("/shop/securityshop");
  });

  it("preserves safe external href detection", () => {
    expect(isExternalStorefrontHref("https://shopstr.market")).toBe(true);
    expect(isExternalStorefrontHref("mailto:test@shopstr.market")).toBe(true);
    expect(isExternalStorefrontHref("/shop/securityshop")).toBe(false);
  });

  it("sanitizes stored storefront config links before publish", () => {
    const sanitized = sanitizeStorefrontConfigLinks({
      shopSlug: "securityshop",
      sections: [
        {
          type: "hero",
          ctaText: "Click",
          ctaLink: "javascript:alert(1)",
        },
      ],
      pages: [
        {
          id: "terms",
          title: "Terms",
          slug: "terms",
          sections: [
            {
              type: "about",
              ctaText: "Learn more",
              ctaLink: "javascript:alert(1)",
            },
          ],
        },
      ],
      navLinks: [{ label: "Docs", href: "javascript:alert(1)" }],
      footer: {
        socialLinks: [{ platform: "website", url: "javascript:alert(1)" }],
        navLinks: [{ label: "Custom", href: "javascript:alert(1)" }],
      },
    });

    expect(sanitized.sections?.[0]?.ctaLink).toBe("#products");
    expect(sanitized.pages?.[0]?.sections[0]?.ctaLink).toBe("#products");
    expect(sanitized.navLinks?.[0]?.href).toBe("/shop/securityshop");
    expect(sanitized.footer?.socialLinks?.[0]?.url).toBe("#");
    expect(sanitized.footer?.navLinks?.[0]?.href).toBe("/shop/securityshop");
  });
});
