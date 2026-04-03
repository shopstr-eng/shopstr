import { useState } from "react";
import {
  StorefrontColorScheme,
  StorefrontSection,
  StorefrontPage,
  StorefrontFooter,
  StorefrontNavLink,
} from "@/utils/types/types";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { getNavTextColor } from "@/utils/storefront-colors";
import SectionRenderer from "@/components/storefront/section-renderer";

export interface StorefrontPreviewPanelProps {
  shopName: string;
  shopAbout: string;
  pictureUrl: string;
  bannerUrl: string;
  colors: StorefrontColorScheme;
  productLayout: "grid" | "list" | "featured";
  landingPageStyle: "classic" | "hero" | "minimal";
  fontHeading: string;
  fontBody: string;
  sections: StorefrontSection[];
  pages: StorefrontPage[];
  footer: StorefrontFooter;
  navLinks: StorefrontNavLink[];
  shopSlug: string;
  sellerProducts?: ProductData[];
  compact?: boolean;
}

const GOOGLE_FONT_OPTIONS = [
  "Inter",
  "Roboto",
  "Lato",
  "Playfair Display",
  "Merriweather",
  "Montserrat",
  "Raleway",
  "Open Sans",
  "Nunito",
  "Poppins",
  "Cormorant Garamond",
  "DM Sans",
  "Josefin Sans",
  "Libre Baskerville",
  "Source Serif 4",
  "Space Grotesk",
  "Syne",
  "Plus Jakarta Sans",
  "Outfit",
  "Urbanist",
];

function buildGoogleFontsUrlForPreview(
  fontHeading: string,
  fontBody: string
): string | null {
  const fonts = new Set<string>();
  if (fontHeading && GOOGLE_FONT_OPTIONS.includes(fontHeading))
    fonts.add(fontHeading);
  if (fontBody && GOOGLE_FONT_OPTIONS.includes(fontBody)) fonts.add(fontBody);
  if (fonts.size === 0) return null;
  const families = [...fonts]
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

const MOCK_PRODUCTS: ProductData[] = [
  {
    id: "mock-1",
    pubkey: "",
    createdAt: 0,
    title: "Handcrafted Necklace",
    summary: "Unique artisan jewelry",
    images: [
      "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?w=300",
    ],
    price: "0.0005",
    currency: "BTC",
    categories: [],
    location: "",
    shippingCost: "",
    shippingType: "N/A",
    quantity: 10,
    shipping: [],
    d: "mock-1",
    pk: "",
    stockNotified: false,
  } as unknown as ProductData,
  {
    id: "mock-2",
    pubkey: "",
    createdAt: 0,
    title: "Leather Wallet",
    summary: "Hand-stitched leather",
    images: [
      "https://images.unsplash.com/photo-1627123424574-724758594e93?w=300",
    ],
    price: "0.001",
    currency: "BTC",
    categories: [],
    location: "",
    shippingCost: "",
    shippingType: "N/A",
    quantity: 5,
    shipping: [],
    d: "mock-2",
    pk: "",
    stockNotified: false,
  } as unknown as ProductData,
  {
    id: "mock-3",
    pubkey: "",
    createdAt: 0,
    title: "Ceramic Mug",
    summary: "Handmade pottery",
    images: [
      "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=300",
    ],
    price: "25",
    currency: "USD",
    categories: [],
    location: "",
    shippingCost: "",
    shippingType: "N/A",
    quantity: 20,
    shipping: [],
    d: "mock-3",
    pk: "",
    stockNotified: false,
  } as unknown as ProductData,
  {
    id: "mock-4",
    pubkey: "",
    createdAt: 0,
    title: "Woven Tote Bag",
    summary: "Eco-friendly carry",
    images: ["https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300"],
    price: "38",
    currency: "USD",
    categories: [],
    location: "",
    shippingCost: "",
    shippingType: "N/A",
    quantity: 15,
    shipping: [],
    d: "mock-4",
    pk: "",
    stockNotified: false,
  } as unknown as ProductData,
];

function fillSectionPlaceholders(
  section: StorefrontSection,
  shopName: string
): StorefrontSection {
  const s = { ...section };
  if (s.type === "hero") {
    s.heading = s.heading || `Welcome to ${shopName}`;
    s.body = s.body || "Discover our unique handcrafted collection.";
    s.ctaText = s.ctaText || "Shop Now";
  } else if (s.type === "about") {
    s.heading = s.heading || "About Us";
    s.body =
      s.body ||
      "We're an independent marketplace seller passionate about bringing you high-quality, unique products. Every item is curated with care.";
  } else if (s.type === "story") {
    s.heading = s.heading || "Our Story";
    s.body =
      s.body ||
      "It started with a simple idea: create something people would love. Since then, we've grown into a shop that customers return to again and again.";
    if (!s.timelineItems || s.timelineItems.length === 0) {
      s.timelineItems = [
        {
          year: "2020",
          heading: "The Beginning",
          body: "We opened our first shop.",
        },
        {
          year: "2022",
          heading: "Growing Community",
          body: "Thousands of happy customers.",
        },
        {
          year: "2024",
          heading: "Today",
          body: "Continuing to innovate and create.",
        },
      ];
    }
  } else if (s.type === "testimonials") {
    s.heading = s.heading || "What Our Customers Say";
    if (!s.testimonials || s.testimonials.length === 0) {
      s.testimonials = [
        {
          quote: "Absolutely love my purchase! Great quality.",
          author: "Sarah M.",
        },
        {
          quote: "Beautifully packaged. Would order again.",
          author: "Jake T.",
        },
        {
          quote: "Unique products you can't find anywhere else.",
          author: "Priya K.",
        },
      ];
    }
  } else if (s.type === "faq") {
    s.heading = s.heading || "Frequently Asked Questions";
    if (!s.items || s.items.length === 0) {
      s.items = [
        {
          question: "Do you ship internationally?",
          answer: "Yes, we ship worldwide with tracked delivery.",
        },
        {
          question: "What is your return policy?",
          answer: "We accept returns within 30 days of purchase.",
        },
        {
          question: "How long does shipping take?",
          answer: "Domestic orders typically arrive in 3–5 business days.",
        },
      ];
    }
  } else if (s.type === "products") {
    s.heading = s.heading || "Our Products";
  } else if (s.type === "ingredients") {
    s.heading = s.heading || "What's Inside";
    if (!s.ingredientItems || s.ingredientItems.length === 0) {
      s.ingredientItems = [
        { name: "Premium Materials" },
        { name: "Eco-Friendly" },
        { name: "Handcrafted" },
        { name: "Long-Lasting" },
        { name: "Non-Toxic" },
        { name: "Sustainable" },
      ];
    }
  } else if (s.type === "comparison") {
    s.heading = s.heading || "Compare Options";
    if (!s.comparisonFeatures || s.comparisonFeatures.length === 0) {
      s.comparisonFeatures = ["Quality", "Price", "Shipping", "Returns"];
    }
    if (!s.comparisonColumns || s.comparisonColumns.length === 0) {
      s.comparisonColumns = [
        {
          heading: "Basic",
          values: ["Good", "Affordable", "Standard", "30 days"],
        },
        {
          heading: "Premium",
          values: ["Excellent", "Best Value", "Express", "60 days"],
        },
      ];
    }
  } else if (s.type === "text") {
    s.heading = s.heading || "A Note from Us";
    s.body =
      s.body ||
      "Thank you for supporting our shop. Every purchase means the world to us and helps us continue creating products we love.";
  } else if (s.type === "contact") {
    s.heading = s.heading || "Get in Touch";
    s.body = s.body || "Have a question? We'd love to hear from you.";
  }
  return s;
}

const DEFAULT_NAV_LINKS = ["Shop", "About", "Contact"];

type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTHS: Record<Viewport, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "390px",
};

export default function StorefrontPreviewPanel({
  shopName,
  shopAbout,
  pictureUrl,
  bannerUrl,
  colors,
  productLayout: _productLayout,
  landingPageStyle,
  fontHeading,
  fontBody,
  sections,
  pages: _pages,
  footer,
  navLinks,
  shopSlug: _shopSlug,
  sellerProducts,
  compact = false,
}: StorefrontPreviewPanelProps) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [activePage, setActivePage] = useState<string>("home");

  const previewProducts =
    sellerProducts && sellerProducts.length > 0
      ? sellerProducts
      : MOCK_PRODUCTS;

  const googleFontsUrl = buildGoogleFontsUrlForPreview(fontHeading, fontBody);

  const primary = colors.primary || "#a438ba";
  const bg = colors.background || "#ffffff";
  const text = colors.text || "#212121";
  const secondary = colors.secondary || "#212121";
  const accent = colors.accent || "#a655f7";
  const navTextColor = getNavTextColor(secondary);
  const primaryTextColor = getNavTextColor(primary);
  const accentTextColor = getNavTextColor(accent);

  const colorSet = { primary, accent, text, background: bg, secondary };

  const displayShopName = shopName || "Your Shop Name";
  const displayAbout =
    shopAbout ||
    "Handcrafted goods made with love — discover our unique collection of artisan products.";

  const displayNavLinks =
    navLinks.length > 0
      ? navLinks.slice(0, 5).map((l) => l.label)
      : DEFAULT_NAV_LINKS;

  const pageOptions = [
    { id: "home", label: "Home" },
    ...(_pages || []).map((p) => ({ id: p.slug, label: p.title })),
  ];

  const activeSections: StorefrontSection[] = (() => {
    if (activePage !== "home") {
      const page = (_pages || []).find((p) => p.slug === activePage);
      if (page) return page.sections.filter((s) => s.enabled !== false);
    }
    return sections.filter((s) => s.enabled !== false);
  })();

  const defaultPlaceholderSections: StorefrontSection[] = [
    { id: "ph-about", type: "about", enabled: true, heading: "", body: "" },
    {
      id: "ph-testimonials",
      type: "testimonials",
      enabled: true,
      heading: "",
      body: "",
    },
    { id: "ph-faq", type: "faq", enabled: true, heading: "", body: "" },
  ];

  const sectionsToShow =
    activeSections.length > 0 ? activeSections : defaultPlaceholderSections;
  const isUsingPlaceholderSections =
    activeSections.length === 0 && activePage === "home";

  const initials = displayShopName
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase();

  const previewWidth = VIEWPORT_WIDTHS[viewport];

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div
        className={`flex flex-shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-dark-fg ${
          compact ? "px-2 py-1" : "px-3 py-2"
        }`}
      >
        {/* Page switcher */}
        {pageOptions.length > 1 ? (
          <select
            value={activePage}
            onChange={(e) => setActivePage(e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-dark-bg dark:text-dark-text"
          >
            {pageOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
            Home
          </span>
        )}

        {/* Viewport toggle */}
        <div className="flex gap-1 rounded-md border border-gray-200 bg-white p-0.5 dark:border-gray-600 dark:bg-dark-bg">
          {(["desktop", "tablet", "mobile"] as Viewport[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setViewport(v)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                viewport === v
                  ? "bg-shopstr-purple text-white dark:bg-shopstr-yellow dark:text-black"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-dark-text"
              }`}
            >
              {v === "desktop" ? "🖥" : v === "tablet" ? "📱" : "📲"}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable preview area */}
      <div className="flex flex-1 overflow-auto bg-gray-100 dark:bg-dark-bg">
        <div
          className="mx-auto overflow-hidden duration-300 transition-all"
          style={{
            width: previewWidth,
            maxWidth: "100%",
            backgroundColor: bg,
            color: text,
            fontFamily: fontBody || "inherit",
          }}
        >
          {/* Google Fonts for preview */}
          {googleFontsUrl && (
            <style
              dangerouslySetInnerHTML={{
                __html: `@import url('${googleFontsUrl}');`,
              }}
            />
          )}

          {/* Nav bar */}
          <div
            className={`flex items-center gap-3 ${
              compact ? "px-3 py-2" : "px-6 py-3"
            }`}
            style={{ backgroundColor: secondary }}
          >
            {pictureUrl ? (
              <img
                src={pictureUrl}
                alt=""
                className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
              />
            ) : (
              <div
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ backgroundColor: primary, color: primaryTextColor }}
              >
                {initials}
              </div>
            )}
            <span
              className="text-base font-bold"
              style={{
                color: navTextColor,
                fontFamily: fontHeading || "inherit",
              }}
            >
              {displayShopName}
            </span>
            <div className="ml-auto flex items-center gap-4">
              {displayNavLinks.map((label, i) => (
                <span
                  key={i}
                  className="cursor-pointer text-xs font-medium"
                  style={{ color: navTextColor + "CC" }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Hero / header — shown when no sections and on home page */}
          {isUsingPlaceholderSections &&
            (landingPageStyle === "hero" ? (
              <div
                className="relative flex min-h-[200px] items-center justify-center overflow-hidden"
                style={{ backgroundColor: primary }}
              >
                {bannerUrl ? (
                  <img
                    src={bannerUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ opacity: 0.4 }}
                  />
                ) : (
                  <div
                    className="absolute inset-0 opacity-20"
                    style={{
                      background: `repeating-linear-gradient(45deg, ${accent} 0px, ${accent} 2px, transparent 2px, transparent 14px)`,
                    }}
                  />
                )}
                <div
                  className="relative z-10 px-8 py-12 text-center"
                  style={{ color: primaryTextColor }}
                >
                  <h1
                    className="mb-3 text-4xl font-bold"
                    style={{ fontFamily: fontHeading || "inherit" }}
                  >
                    {displayShopName}
                  </h1>
                  <p className="mb-6 text-lg opacity-90">{displayAbout}</p>
                  <button
                    className="rounded-lg px-6 py-2.5 text-sm font-bold"
                    style={{
                      backgroundColor: accent,
                      color: accentTextColor,
                    }}
                  >
                    Shop Now
                  </button>
                </div>
              </div>
            ) : landingPageStyle === "classic" ? (
              <div>
                {bannerUrl ? (
                  <img
                    src={bannerUrl}
                    alt=""
                    className="h-48 w-full object-cover"
                  />
                ) : (
                  <div
                    className="relative flex h-48 w-full items-center justify-center overflow-hidden"
                    style={{ backgroundColor: primary + "33" }}
                  >
                    <div
                      className="absolute inset-0 opacity-30"
                      style={{
                        background: `repeating-linear-gradient(45deg, ${primary} 0px, ${primary} 2px, transparent 2px, transparent 14px)`,
                      }}
                    />
                    <span
                      className="relative text-xs font-semibold opacity-40"
                      style={{ color: primary }}
                    >
                      Banner image
                    </span>
                  </div>
                )}
                <div
                  className="px-8 py-6 text-center"
                  style={{ borderBottom: `3px solid ${primary}33` }}
                >
                  <h1
                    className="mb-2 text-3xl font-bold"
                    style={{
                      fontFamily: fontHeading || "inherit",
                      color: text,
                    }}
                  >
                    {displayShopName}
                  </h1>
                  <p className="text-base opacity-70" style={{ color: text }}>
                    {displayAbout}
                  </p>
                </div>
              </div>
            ) : (
              <div
                className="border-b px-8 py-6"
                style={{ borderColor: primary + "33" }}
              >
                <div className="flex items-center gap-4">
                  {pictureUrl ? (
                    <img
                      src={pictureUrl}
                      alt=""
                      className="h-14 w-14 rounded-full border-2 object-cover"
                      style={{ borderColor: primary }}
                    />
                  ) : (
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold"
                      style={{
                        backgroundColor: primary,
                        color: primaryTextColor,
                      }}
                    >
                      {initials}
                    </div>
                  )}
                  <div>
                    <h1
                      className="text-2xl font-bold"
                      style={{
                        fontFamily: fontHeading || "inherit",
                        color: primary,
                      }}
                    >
                      {displayShopName}
                    </h1>
                    <p className="text-sm opacity-70" style={{ color: text }}>
                      {displayAbout}
                    </p>
                  </div>
                </div>
              </div>
            ))}

          {/* Sections */}
          <div style={{ backgroundColor: bg }}>
            {isUsingPlaceholderSections && (
              <div
                className="flex items-center gap-2 border-b px-6 py-2"
                style={{
                  borderColor: primary + "22",
                  backgroundColor: primary + "08",
                }}
              >
                <span className="text-xs opacity-60" style={{ color: primary }}>
                  ✦ No sections added yet — showing example layout below
                </span>
              </div>
            )}
            {sectionsToShow.map((section, i) => {
              const filled = isUsingPlaceholderSections
                ? fillSectionPlaceholders(section, displayShopName)
                : section;
              return (
                <div key={section.id || i}>
                  {i > 0 && !compact && (
                    <div
                      className="mx-6 border-t opacity-20"
                      style={{ borderColor: primary }}
                    />
                  )}
                  <SectionRenderer
                    section={filled}
                    colors={colorSet}
                    shopName={displayShopName}
                    shopPicture={pictureUrl}
                    shopPubkey=""
                    products={previewProducts}
                    isPreview={true}
                  />
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            className="px-6 py-8"
            style={{ backgroundColor: secondary, color: navTextColor }}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p
                  className="font-bold"
                  style={{ fontFamily: fontHeading || "inherit" }}
                >
                  {displayShopName}
                </p>
                {footer.text && (
                  <p className="mt-1 max-w-xs text-xs opacity-60">
                    {footer.text}
                  </p>
                )}
              </div>
              {(footer.navLinks || []).length > 0 && (
                <div className="flex flex-wrap gap-4">
                  {(footer.navLinks || []).map((link, i) => (
                    <span key={i} className="text-xs opacity-60">
                      {link.label}
                    </span>
                  ))}
                </div>
              )}
              {(footer.socialLinks || []).length > 0 && (
                <div className="flex gap-2">
                  {(footer.socialLinks || []).map((_s, i) => (
                    <div
                      key={i}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs"
                      style={{
                        backgroundColor: primary + "22",
                        color: primary,
                      }}
                    >
                      ↗
                    </div>
                  ))}
                </div>
              )}
            </div>
            {footer.showPoweredBy !== false && (
              <p className="mt-6 text-center text-xs opacity-30">
                Powered by Shopstr
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
