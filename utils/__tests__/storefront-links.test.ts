import {
  isExternalStorefrontHref,
  sanitizeStorefrontConfigLinks,
  sanitizeStorefrontHref,
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
    ).toBe("/stall/securityshop/orders");
  });

  it("falls back when custom nav links use blocked schemes", () => {
    expect(
      sanitizeStorefrontNavHref(
        { label: "Malicious", href: "javascript:alert(1)" },
        "securityshop"
      )
    ).toBe("/stall/securityshop");
  });

  it("preserves safe external href detection", () => {
    expect(isExternalStorefrontHref("https://shopstr.market")).toBe(true);
    expect(isExternalStorefrontHref("mailto:test@shopstr.market")).toBe(true);
    expect(isExternalStorefrontHref("/stall/securityshop")).toBe(false);
  });

  describe("scheme bypass attempts", () => {
    it.each([
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "\tjavascript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "java\u200Bscript:alert(1)",
      "\u00A0javascript:alert(1)",
      "VBScript:msgbox(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "blob:https://evil/abc",
    ])("rejects %s in section CTAs", (input) => {
      expect(sanitizeStorefrontSectionLink(input)).toBe("#products");
    });

    it.each([
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
    ])("rejects %s in social links", (input) => {
      expect(sanitizeStorefrontSocialLink(input)).toBe("#");
    });

    it.each([
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,x",
    ])("rejects %s in nav hrefs", (input) => {
      expect(
        sanitizeStorefrontNavHref({ label: "x", href: input }, "securityshop")
      ).toBe("/stall/securityshop");
    });
  });

  describe("section CTA scheme allow-list", () => {
    it("allows http and https", () => {
      expect(sanitizeStorefrontSectionLink("https://shopstr.market")).toBe(
        "https://shopstr.market"
      );
      expect(sanitizeStorefrontSectionLink("http://shopstr.market")).toBe(
        "http://shopstr.market"
      );
    });

    it("allows in-page anchors", () => {
      expect(sanitizeStorefrontSectionLink("#products")).toBe("#products");
      expect(sanitizeStorefrontSectionLink("#contact")).toBe("#contact");
    });

    it("allows site-relative paths", () => {
      expect(sanitizeStorefrontSectionLink("/stall/securityshop/about")).toBe(
        "/stall/securityshop/about"
      );
    });

    it("rejects mailto and tel in section CTAs", () => {
      expect(sanitizeStorefrontSectionLink("mailto:a@b.com")).toBe("#products");
      expect(sanitizeStorefrontSectionLink("tel:+15551234")).toBe("#products");
    });
  });

  describe("isPage path traversal", () => {
    it("strips parent-segment traversal", () => {
      expect(
        sanitizeStorefrontNavHref(
          { label: "Bad", href: "../../evil", isPage: true },
          "securityshop"
        )
      ).toBe("/stall/securityshop/evil");
    });

    it("strips current-segment dots", () => {
      expect(
        sanitizeStorefrontNavHref(
          { label: "Bad", href: "./evil", isPage: true },
          "securityshop"
        )
      ).toBe("/stall/securityshop/evil");
    });

    it("URL-encodes unsafe characters in page slugs", () => {
      expect(
        sanitizeStorefrontNavHref(
          { label: "Bad", href: "evil page", isPage: true },
          "securityshop"
        )
      ).toBe("/stall/securityshop/evil%20page");
    });

    it("does not let bare-relative custom links escape via traversal", () => {
      expect(
        sanitizeStorefrontNavHref(
          { label: "Bad", href: "../../etc/passwd" },
          "securityshop"
        )
      ).toBe("/stall/securityshop/etc/passwd");
    });
  });

  describe("empty shopSlug", () => {
    it("does not produce double-slash paths for nav fallback", () => {
      expect(
        sanitizeStorefrontNavHref(
          { label: "x", href: "javascript:alert(1)" },
          ""
        )
      ).toBe("/");
    });

    it("does not produce double-slash for isPage with empty slug", () => {
      expect(
        sanitizeStorefrontNavHref(
          { label: "x", href: "orders", isPage: true },
          ""
        )
      ).toBe("/orders");
    });
  });

  it("sanitizeStorefrontHref allows safe external schemes", () => {
    expect(sanitizeStorefrontHref("https://shopstr.market", "#")).toBe(
      "https://shopstr.market"
    );
    expect(sanitizeStorefrontHref("mailto:a@b.com", "#")).toBe(
      "mailto:a@b.com"
    );
  });

  it("sanitizes stored storefront config links before publish", () => {
    const sanitized = sanitizeStorefrontConfigLinks({
      shopSlug: "securityshop",
      sections: [
        {
          id: "s1",
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
              id: "p1",
              type: "about",
              ctaText: "Learn more",
              ctaLink: "java\tscript:alert(1)",
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
    expect(sanitized.navLinks?.[0]?.href).toBe("/stall/securityshop");
    expect(sanitized.footer?.socialLinks?.[0]?.url).toBe("#");
    expect(sanitized.footer?.navLinks?.[0]?.href).toBe("/stall/securityshop");
  });
});
