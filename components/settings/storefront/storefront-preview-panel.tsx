import { useState, useRef, useMemo } from "react";
import {
  StorefrontColorScheme,
  StorefrontSection,
  StorefrontPage,
  StorefrontFooter,
  StorefrontNavLink,
  StorefrontNavColors,
  StorefrontFooterColors,
} from "@/utils/types/types";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import SectionRenderer from "@/components/storefront/section-renderer";
import StorefrontFooterComponent from "@/components/storefront/storefront-footer";
import FormattedText from "@/components/storefront/formatted-text";

const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1600788886242-5c96aabe3757?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1523473827533-2a64d0d36748?w=400&h=400&fit=crop",
  "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=400&fit=crop",
];

const PLACEHOLDER_BANNER =
  "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&h=400&fit=crop";
const PLACEHOLDER_PROFILE =
  "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=200&h=200&fit=crop";
const PLACEHOLDER_ABOUT_IMAGE =
  "https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=600&h=400&fit=crop";
const PLACEHOLDER_STORY_IMAGE =
  "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=400&h=300&fit=crop";
const PLACEHOLDER_SECTION_IMAGE =
  "https://images.unsplash.com/photo-1471193945509-9ad0617afabf?w=1200&h=500&fit=crop";

const SECTION_PLACEHOLDERS: Record<string, Partial<StorefrontSection>> = {
  hero: {
    heading: "Welcome to Our Farm",
    subheading:
      "Sustainably raised, locally grown. Fresh from our family to yours.",
    image: PLACEHOLDER_BANNER,
    ctaText: "Shop Now",
    ctaLink: "#products",
    overlayOpacity: 0.6,
  },
  about: {
    heading: "About Our Farm",
    body: "We're a small family farm dedicated to producing the highest quality food using traditional, sustainable methods. Our animals are raised on open pasture, and our produce is grown without synthetic chemicals.\n\nEvery product we offer is made with care, from our raw milk and farmstead cheeses to our pasture-raised eggs and grass-fed meats. We believe in food freedom — your right to choose real, nutrient-dense food direct from the source.",
    image: PLACEHOLDER_ABOUT_IMAGE,
    imagePosition: "right" as const,
  },
  story: {
    heading: "Our Story",
    body: "From a small homestead to a thriving local farm, our journey has been one of passion and perseverance.",
    timelineItems: [
      {
        year: "2018",
        heading: "The Beginning",
        body: "Started with just two dairy cows and a dream of producing the finest raw milk in the county.",
        image: PLACEHOLDER_STORY_IMAGE,
      },
      {
        year: "2020",
        heading: "Growing the Herd",
        body: "Expanded to 12 cows and began offering farmstead cheese and butter to our growing community of customers.",
      },
      {
        year: "2022",
        heading: "Farm Store Opens",
        body: "Opened our on-farm store and began offering pastured eggs, honey, and seasonal produce alongside our dairy products.",
      },
      {
        year: "2024",
        heading: "Going Direct",
        body: "Launched our online store to bring farm-fresh products directly to families across the region, cutting out the middleman.",
      },
    ],
  },
  products: {
    heading: "Our Products",
    subheading: "Browse our selection of farm-fresh goods",
  },
  testimonials: {
    heading: "What Our Customers Say",
    testimonials: [
      {
        quote:
          "The best raw milk I've ever tasted. My whole family loves it, and we've noticed a real difference in how we feel.",
        author: "Sarah M.",
        rating: 5,
      },
      {
        quote:
          "Their farmstead cheese is incredible — you can taste the difference that grass-fed, pasture-raised makes. We order every month!",
        author: "James T.",
        rating: 5,
      },
      {
        quote:
          "So grateful to have found a local source for real food. The eggs have the deepest orange yolks I've ever seen. Will never go back to store-bought.",
        author: "Maria L.",
        rating: 5,
      },
    ],
  },
  faq: {
    heading: "Frequently Asked Questions",
    items: [
      {
        question: "How do I pick up my order?",
        answer:
          "We offer weekly pickup at our farm store every Saturday from 9am-2pm. You'll receive a confirmation email with directions and your order details.",
      },
      {
        question: "Do you offer delivery?",
        answer:
          "Yes! We deliver within a 50-mile radius every Thursday. Orders must be placed by Tuesday evening. A flat delivery fee of $5 applies.",
      },
      {
        question: "Is your milk really raw?",
        answer:
          "Yes — our milk is completely unprocessed. It is not pasteurized or homogenized, preserving all the natural enzymes, beneficial bacteria, and full-bodied flavor.",
      },
      {
        question: "What do your animals eat?",
        answer:
          "Our cows are 100% grass-fed and grass-finished on rotational pasture. Our chickens are raised on open pasture with supplemental organic, soy-free feed.",
      },
    ],
  },
  ingredients: {
    heading: "What Goes Into Our Products",
    body: "Simple, honest ingredients from our farm to your table. Nothing artificial, ever.",
    ingredientItems: [
      {
        name: "Raw Whole Milk",
        description: "Unprocessed, full-fat milk from grass-fed cows",
      },
      {
        name: "Pastured Eggs",
        description: "Free-range eggs from hens on open pasture",
      },
      { name: "Sea Salt", description: "Mineral-rich unrefined sea salt" },
      {
        name: "Natural Cultures",
        description: "Traditional starter cultures for our cheeses",
      },
      {
        name: "Wildflower Honey",
        description: "Raw honey from our own apiaries",
      },
      {
        name: "Seasonal Herbs",
        description: "Organically grown herbs from our garden",
      },
    ],
  },
  comparison: {
    heading: "Why Choose Us",
    comparisonFeatures: [
      "Pasteurized",
      "Grass-Fed",
      "No Hormones/Antibiotics",
      "Direct from Farm",
      "Know Your Farmer",
      "Nutrient Dense",
    ],
    comparisonColumns: [
      {
        heading: "Our Farm",
        values: [
          "No — Raw",
          "✓ Always",
          "✓ Never Used",
          "✓ Yes",
          "✓ Yes",
          "✓ Maximum",
        ],
      },
      {
        heading: "Store Bought",
        values: [
          "Yes",
          "Rarely",
          "Often Used",
          "No — 3+ Middlemen",
          "No",
          "Reduced by Processing",
        ],
      },
    ],
  },
  text: {
    heading: "Our Promise to You",
    body: "We believe that everyone deserves access to real, nutrient-dense food produced with integrity. Every product from our farm is made with the same care we'd put into feeding our own family.\n\nWe practice regenerative agriculture that builds soil health, supports biodiversity, and produces food that nourishes both people and the land. When you buy from us, you're not just getting exceptional food — you're supporting a more sustainable food system.",
  },
  image: {
    image: PLACEHOLDER_SECTION_IMAGE,
    caption: "Our cows grazing on open pasture at sunset",
    fullWidth: true,
  },
  contact: {
    heading: "Get in Touch",
    body: "We'd love to hear from you. Whether you have questions about our products, want to schedule a farm visit, or just want to say hello — reach out anytime.",
    email: "hello@example-farm.com",
    phone: "(555) 123-4567",
    address: "1234 Country Road\nGreen Valley, CA 95945",
  },
  reviews: {
    heading: "Customer Reviews",
  },
};

export function fillSectionPlaceholders(
  section: StorefrontSection,
  shopName: string
): StorefrontSection {
  const placeholders = SECTION_PLACEHOLDERS[section.type];
  if (!placeholders) return section;

  const filled: StorefrontSection = { ...section };

  if (!filled.heading && placeholders.heading) {
    filled.heading = placeholders.heading.replace(
      /Our Farm/g,
      shopName || "Our Farm"
    );
  }

  if (!filled.subheading && placeholders.subheading)
    filled.subheading = placeholders.subheading;
  if (!filled.body && placeholders.body) filled.body = placeholders.body;
  if (!filled.image && placeholders.image) filled.image = placeholders.image;
  if (filled.imagePosition === undefined && placeholders.imagePosition)
    filled.imagePosition = placeholders.imagePosition;
  if (filled.fullWidth === undefined && placeholders.fullWidth !== undefined)
    filled.fullWidth = placeholders.fullWidth;
  if (!filled.ctaText && placeholders.ctaText)
    filled.ctaText = placeholders.ctaText;
  if (!filled.ctaLink && placeholders.ctaLink)
    filled.ctaLink = placeholders.ctaLink;
  if (
    filled.overlayOpacity === undefined &&
    placeholders.overlayOpacity !== undefined
  )
    filled.overlayOpacity = placeholders.overlayOpacity;
  if (!filled.caption && placeholders.caption)
    filled.caption = placeholders.caption;
  if (!filled.email && placeholders.email) filled.email = placeholders.email;
  if (!filled.phone && placeholders.phone) filled.phone = placeholders.phone;
  if (!filled.address && placeholders.address)
    filled.address = placeholders.address;

  if ((!filled.items || filled.items.length === 0) && placeholders.items)
    filled.items = placeholders.items;
  if (
    (!filled.testimonials || filled.testimonials.length === 0) &&
    placeholders.testimonials
  )
    filled.testimonials = placeholders.testimonials;
  if (
    (!filled.ingredientItems || filled.ingredientItems.length === 0) &&
    placeholders.ingredientItems
  )
    filled.ingredientItems = placeholders.ingredientItems;
  if (
    (!filled.comparisonFeatures || filled.comparisonFeatures.length === 0) &&
    placeholders.comparisonFeatures
  )
    filled.comparisonFeatures = placeholders.comparisonFeatures;
  if (
    (!filled.comparisonColumns || filled.comparisonColumns.length === 0) &&
    placeholders.comparisonColumns
  )
    filled.comparisonColumns = placeholders.comparisonColumns;
  if (
    (!filled.timelineItems || filled.timelineItems.length === 0) &&
    placeholders.timelineItems
  )
    filled.timelineItems = placeholders.timelineItems;

  return filled;
}

export function fillFooterPlaceholders(
  footer: StorefrontFooter,
  shopName: string
): StorefrontFooter {
  return {
    text:
      footer.text ||
      `${
        shopName || "Our Farm"
      } — Real food, raised right, delivered to your door.`,
    socialLinks:
      footer.socialLinks && footer.socialLinks.length > 0
        ? footer.socialLinks
        : [
            {
              platform: "instagram" as const,
              url: "https://instagram.com",
              label: "Instagram",
            },
            { platform: "x" as const, url: "https://x.com", label: "X" },
            {
              platform: "email" as const,
              url: "mailto:hello@example-farm.com",
              label: "Email",
            },
          ],
    navLinks: footer.navLinks,
    showPoweredBy: footer.showPoweredBy,
  };
}

export const MOCK_PRODUCTS: ProductData[] = [
  {
    id: "preview-1",
    pubkey: "preview",
    createdAt: 0,
    title: "Farm Fresh Raw Milk",
    summary:
      "Pure, unprocessed whole milk from grass-fed cows. Rich in natural enzymes and beneficial bacteria.",
    publishedAt: "",
    images: [PLACEHOLDER_IMAGES[0]!],
    categories: ["dairy"],
    location: "Local Farm",
    price: 12,
    currency: "USD",
    totalCost: 12,
  },
  {
    id: "preview-2",
    pubkey: "preview",
    createdAt: 0,
    title: "Organic Free-Range Eggs",
    summary:
      "Pasture-raised eggs from happy hens. Deep orange yolks with exceptional flavor.",
    publishedAt: "",
    images: [PLACEHOLDER_IMAGES[1]!],
    categories: ["eggs"],
    location: "Local Farm",
    price: 8,
    currency: "USD",
    totalCost: 8,
  },
  {
    id: "preview-3",
    pubkey: "preview",
    createdAt: 0,
    title: "Artisan Farmstead Cheese",
    summary:
      "Handcrafted aged cheddar made from our own raw milk. 6-month aged for complex flavor.",
    publishedAt: "",
    images: [PLACEHOLDER_IMAGES[2]!],
    categories: ["dairy"],
    location: "Local Farm",
    price: 18,
    currency: "USD",
    totalCost: 18,
  },
  {
    id: "preview-4",
    pubkey: "preview",
    createdAt: 0,
    title: "Raw Wildflower Honey",
    summary:
      "Unfiltered, unpasteurized honey from our own apiaries. Seasonal wildflower blend.",
    publishedAt: "",
    images: [PLACEHOLDER_IMAGES[3]!],
    categories: ["honey"],
    location: "Local Farm",
    price: 15,
    currency: "USD",
    totalCost: 15,
  },
  {
    id: "preview-5",
    pubkey: "preview",
    createdAt: 0,
    title: "Grass-Fed Beef Bundle",
    summary:
      "Mixed cuts of 100% grass-fed, grass-finished beef. No hormones or antibiotics.",
    publishedAt: "",
    images: [PLACEHOLDER_IMAGES[4]!],
    categories: ["meat"],
    location: "Local Farm",
    price: 85,
    currency: "USD",
    totalCost: 85,
  },
  {
    id: "preview-6",
    pubkey: "preview",
    createdAt: 0,
    title: "Fermented Vegetables Mix",
    summary:
      "Probiotic-rich naturally fermented seasonal vegetables. Small-batch, live culture.",
    publishedAt: "",
    images: [PLACEHOLDER_IMAGES[5]!],
    categories: ["fermented"],
    location: "Local Farm",
    price: 10,
    currency: "USD",
    totalCost: 10,
  },
];

export const GOOGLE_FONT_OPTIONS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Playfair Display",
  "Merriweather",
  "Raleway",
  "Nunito",
  "Oswald",
  "Source Sans 3",
  "PT Serif",
  "Bitter",
  "Crimson Text",
];

export function buildGoogleFontsUrl(
  heading?: string,
  body?: string
): string | null {
  const fonts = new Set<string>();
  if (heading && GOOGLE_FONT_OPTIONS.includes(heading)) fonts.add(heading);
  if (body && GOOGLE_FONT_OPTIONS.includes(body)) fonts.add(body);
  if (fonts.size === 0) return null;
  const families = Array.from(fonts)
    .map((f) => `family=${f.replace(/ /g, "+")}:wght@400;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

interface StorefrontPreviewPanelProps {
  shopName: string;
  shopAbout: string;
  pictureUrl: string;
  bannerUrl: string;
  colors: StorefrontColorScheme;
  productLayout: "grid" | "list" | "featured";
  landingPageStyle: "classic" | "hero" | "minimal";
  fontHeading: string;
  fontBody: string;
  customFontHeadingUrl?: string;
  customFontHeadingName?: string;
  customFontBodyUrl?: string;
  customFontBodyName?: string;
  sections: StorefrontSection[];
  pages: StorefrontPage[];
  footer: StorefrontFooter;
  navLinks: StorefrontNavLink[];
  navColors?: StorefrontNavColors;
  footerColors?: StorefrontFooterColors;
  shopSlug: string;
  compact?: boolean;
}

export default function StorefrontPreviewPanel({
  shopName,
  shopAbout,
  pictureUrl,
  bannerUrl,
  colors,
  productLayout,
  landingPageStyle,
  fontHeading,
  fontBody,
  customFontHeadingUrl,
  customFontHeadingName,
  customFontBodyUrl,
  customFontBodyName,
  sections,
  pages,
  footer,
  navLinks,
  navColors,
  footerColors,
  shopSlug,
  compact,
}: StorefrontPreviewPanelProps) {
  const [previewPage, setPreviewPage] = useState<string>("");
  const [viewportWidth, setViewportWidth] = useState<
    "desktop" | "tablet" | "mobile"
  >("desktop");
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = shopName || "Your Shop";
  const displayAbout =
    shopAbout ||
    "Welcome to our farm-fresh marketplace. Sustainably raised, locally grown produce delivered directly from our family to yours.";
  const displayPicture = pictureUrl || PLACEHOLDER_PROFILE;
  const displayBanner = bannerUrl || PLACEHOLDER_BANNER;

  const googleFontsUrl = (() => {
    const needsGoogle = !customFontHeadingUrl || !customFontBodyUrl;
    const needsPoppinsFallback = customFontHeadingUrl || customFontBodyUrl;
    if (!needsGoogle && !needsPoppinsFallback) return null;
    const fonts = new Set<string>();
    if (
      !customFontHeadingUrl &&
      fontHeading &&
      GOOGLE_FONT_OPTIONS.includes(fontHeading)
    )
      fonts.add(fontHeading);
    if (
      !customFontBodyUrl &&
      fontBody &&
      GOOGLE_FONT_OPTIONS.includes(fontBody)
    )
      fonts.add(fontBody);
    if (needsPoppinsFallback) fonts.add("Poppins");
    if (fonts.size === 0) return null;
    const families = Array.from(fonts)
      .map((f) => `family=${f.replace(/ /g, "+")}:wght@400;600;700`)
      .join("&");
    return `https://fonts.googleapis.com/css2?${families}&display=swap`;
  })();

  const getFontFormat = (url: string): string => {
    if (url.includes(".woff2")) return "woff2";
    if (url.includes(".woff")) return "woff";
    if (url.includes(".otf")) return "opentype";
    if (url.includes(".ttf")) return "truetype";
    return "woff2";
  };

  const customFontFaceCss = (() => {
    let css = "";
    if (customFontHeadingUrl) {
      const name =
        customFontHeadingName?.replace(/\.[^.]+$/, "") || "CustomHeading";
      const format = getFontFormat(customFontHeadingUrl);
      css += `@font-face { font-family: '${name}'; src: url('${customFontHeadingUrl}') format('${format}'); font-weight: 100 900; font-display: swap; }\n`;
    }
    if (customFontBodyUrl && customFontBodyUrl !== customFontHeadingUrl) {
      const name = customFontBodyName?.replace(/\.[^.]+$/, "") || "CustomBody";
      const format = getFontFormat(customFontBodyUrl);
      css += `@font-face { font-family: '${name}'; src: url('${customFontBodyUrl}') format('${format}'); font-weight: 100 900; font-display: swap; }\n`;
    }
    return css;
  })();

  const hasSections = sections.length > 0;

  const previewNavLinks: StorefrontNavLink[] = useMemo(() => {
    const links: StorefrontNavLink[] =
      navLinks.length > 0 ? [...navLinks] : [{ label: "Home", href: "" }];
    const alreadyHasShop = links.some(
      (l) => l.href === "shop" || l.href === "/shop"
    );
    if (!alreadyHasShop) {
      const homeIdx = links.findIndex((l) => l.href === "" || l.href === "/");
      links.splice(homeIdx + 1, 0, {
        label: "Shop",
        href: "shop",
        isPage: true,
      });
    }
    return links;
  }, [navLinks]);

  const activeSections = (() => {
    let raw: StorefrontSection[];
    if (previewPage && pages.length > 0) {
      const page = pages.find((p) => p.slug === previewPage);
      raw = page ? page.sections.filter((s) => s.enabled !== false) : [];
    } else {
      raw = sections.filter((s) => s.enabled !== false);
    }
    return raw.map((s) => fillSectionPlaceholders(s, displayName));
  })();

  const previewFooter = fillFooterPlaceholders(footer, displayName);

  const handleNavClick = (link: StorefrontNavLink) => {
    if (link.isPage) {
      setPreviewPage(link.href);
    } else if (link.href === "" || link.href === "/") {
      setPreviewPage("");
    } else {
      setPreviewPage(link.href);
    }
  };

  const cssVars = {
    "--sf-primary": colors.primary,
    "--sf-secondary": colors.secondary,
    "--sf-accent": colors.accent,
    "--sf-bg": colors.background,
    "--sf-text": colors.text,
  } as React.CSSProperties;

  const resolvedHeadingFont = customFontHeadingUrl
    ? `'${customFontHeadingName?.replace(/\.[^.]+$/, "") || "CustomHeading"}', 'Poppins', sans-serif`
    : fontHeading
      ? `'${fontHeading}', sans-serif`
      : "";
  const resolvedBodyFont = customFontBodyUrl
    ? `'${customFontBodyName?.replace(/\.[^.]+$/, "") || "CustomBody"}', 'Poppins', sans-serif`
    : fontBody
      ? `'${fontBody}', sans-serif`
      : "";

  const fontStyles = {
    ...(resolvedHeadingFont ? { "--font-heading": resolvedHeadingFont } : {}),
    ...(resolvedBodyFont ? { "--font-body": resolvedBodyFont } : {}),
  } as React.CSSProperties;

  const viewportWidthClass = {
    desktop: "w-full",
    tablet: "w-[768px]",
    mobile: "w-[375px]",
  }[viewportWidth];

  return (
    <div className="flex h-full flex-col">
      {googleFontsUrl && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin="anonymous"
          />
          <link href={googleFontsUrl} rel="stylesheet" />
        </>
      )}
      {customFontFaceCss && <style>{customFontFaceCss}</style>}
      <style>{`
        .preview-container .font-heading { font-family: var(--font-heading, inherit); }
        .preview-container .font-body { font-family: var(--font-body, inherit); }
      `}</style>

      <div
        className={`flex items-center justify-between border-b border-gray-700 bg-gray-900 ${
          compact ? "px-3 py-2" : "px-4 py-3"
        }`}
      >
        <div className="flex items-center gap-3">
          <h3
            className={`font-bold text-white ${
              compact ? "text-sm" : "text-base"
            }`}
          >
            {previewPage
              ? `Page: ${
                  previewPage === "shop"
                    ? "Shop"
                    : pages.find((p) => p.slug === previewPage)?.title ||
                      previewPage
                }`
              : "Live Preview"}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg bg-gray-800 p-0.5">
            {(
              [
                { key: "desktop" as const, label: "D", fullLabel: "Desktop" },
                { key: "tablet" as const, label: "T", fullLabel: "Tablet" },
                { key: "mobile" as const, label: "M", fullLabel: "Mobile" },
              ] as const
            ).map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setViewportWidth(v.key)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                  viewportWidth === v.key
                    ? "bg-gray-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
                title={v.fullLabel}
              >
                {compact ? v.label : v.fullLabel}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setPreviewPage("")}
              className={`rounded px-2 py-1 text-xs font-medium ${
                !previewPage
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => setPreviewPage("shop")}
              className={`rounded px-2 py-1 text-xs font-medium ${
                previewPage === "shop"
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Shop
            </button>
            {pages.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() => setPreviewPage(page.slug)}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  previewPage === page.slug
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {page.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center overflow-auto bg-gray-800 p-3">
        <div
          ref={containerRef}
          className={`preview-container ${viewportWidthClass} mx-auto min-h-[600px] overflow-hidden rounded-lg shadow-2xl`}
          style={{
            maxWidth: viewportWidth === "desktop" ? "100%" : undefined,
          }}
        >
          <div
            className="min-h-screen"
            style={{
              ...cssVars,
              ...fontStyles,
              backgroundColor: "var(--sf-bg)",
              color: "var(--sf-text)",
            }}
          >
            <PreviewNav
              shopName={displayName}
              pictureUrl={displayPicture}
              colors={colors}
              navColors={navColors}
              navLinks={previewNavLinks}
              currentPage={previewPage}
              onNavClick={handleNavClick}
            />

            {previewPage === "shop" && (
              <div className="mx-auto max-w-6xl px-4 pt-20 pb-8 md:px-6">
                <h2
                  className="font-heading mb-4 text-xl font-bold"
                  style={{ color: colors.text }}
                >
                  Shop
                </h2>
                <div
                  className="mb-4 rounded-lg border-2 px-4 py-2"
                  style={{
                    borderColor: colors.primary + "44",
                    backgroundColor: colors.background,
                    color: colors.text + "66",
                  }}
                >
                  Search products...
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {["All", "Milk", "Cheese", "Eggs"].map((cat, i) => (
                    <span
                      key={cat}
                      className="rounded-full border-2 px-3 py-1 text-xs font-medium"
                      style={{
                        borderColor:
                          i === 0 ? colors.primary : colors.primary + "33",
                        backgroundColor:
                          i === 0 ? colors.primary : "transparent",
                        color: i === 0 ? colors.background : colors.text + "CC",
                      }}
                    >
                      {cat}
                    </span>
                  ))}
                </div>
                <PreviewProductGrid
                  products={MOCK_PRODUCTS}
                  layout={productLayout}
                  colors={colors}
                />
              </div>
            )}

            {!previewPage && landingPageStyle !== "hero" && (
              <div className="pt-14">
                {landingPageStyle === "classic" && (
                  <>
                    <div className="w-full">
                      <img
                        src={displayBanner}
                        alt={`${displayName} Banner`}
                        className="h-[200px] w-full object-cover md:h-[280px]"
                      />
                    </div>
                    <div
                      className="border-b px-6 py-8"
                      style={{ borderColor: colors.primary + "33" }}
                    >
                      <div className="mx-auto flex max-w-6xl items-center gap-6">
                        <img
                          src={displayPicture}
                          alt={displayName}
                          className="h-20 w-20 rounded-full border-4 object-cover"
                          style={{ borderColor: colors.primary }}
                        />
                        <div>
                          <h1
                            className="font-heading text-3xl font-bold"
                            style={{ color: "var(--sf-text)" }}
                          >
                            {displayName}
                          </h1>
                          <FormattedText
                            text={displayAbout}
                            as="p"
                            className="font-body mt-2 max-w-2xl opacity-70"
                          />
                          <div className="mt-2 flex items-center gap-3 text-sm opacity-60">
                            <span>{MOCK_PRODUCTS.length} products</span>
                            <span>12 reviews</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {landingPageStyle === "minimal" && (
                  <div className="px-6 pt-24 pb-4">
                    <div className="mx-auto max-w-6xl">
                      <div className="flex items-center gap-4">
                        <img
                          src={displayPicture}
                          alt={displayName}
                          className="h-14 w-14 rounded-full object-cover"
                        />
                        <div>
                          <h1 className="font-heading text-2xl font-bold">
                            {displayName}
                          </h1>
                          <p className="text-sm opacity-60">
                            {MOCK_PRODUCTS.length} products
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {previewPage === "shop" ? null : hasSections &&
              activeSections.length > 0 ? (
              <div
                className={
                  activeSections[0]?.type === "hero"
                    ? "pt-14"
                    : !previewPage
                      ? ""
                      : "pt-14"
                }
              >
                {activeSections.map((section) => (
                  <SectionRenderer
                    key={section.id}
                    section={{
                      ...section,
                      productLayout: section.productLayout || productLayout,
                    }}
                    colors={colors}
                    shopName={displayName}
                    shopPicture={displayPicture}
                    shopPubkey="preview"
                    products={MOCK_PRODUCTS}
                    isPreview
                  />
                ))}
              </div>
            ) : previewPage !== "shop" ? (
              <div
                className={`mx-auto max-w-6xl px-4 py-8 md:px-6 ${
                  landingPageStyle === "hero" ? "pt-14" : ""
                }`}
              >
                <PreviewProductGrid
                  products={MOCK_PRODUCTS}
                  layout={productLayout}
                  colors={colors}
                />
              </div>
            ) : null}

            <StorefrontFooterComponent
              footer={previewFooter}
              colors={colors}
              footerColors={footerColors}
              shopName={displayName}
              shopSlug={shopSlug || "preview"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewNav({
  shopName,
  pictureUrl,
  colors,
  navColors,
  navLinks,
  currentPage,
  onNavClick,
}: {
  shopName: string;
  pictureUrl: string;
  colors: StorefrontColorScheme;
  navColors?: StorefrontNavColors;
  navLinks: StorefrontNavLink[];
  currentPage: string;
  onNavClick: (link: StorefrontNavLink) => void;
}) {
  const bg = navColors?.background || colors.secondary;
  const text = navColors?.text || colors.background;
  const accent = navColors?.accent || colors.primary;

  return (
    <nav
      className="top-0 right-0 left-0 z-40 border-b"
      style={{
        backgroundColor: bg,
        borderColor: accent + "33",
        position: "sticky",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          {pictureUrl && (
            <img
              src={pictureUrl}
              alt={shopName}
              className="h-8 w-8 rounded-full object-cover"
            />
          )}
          <span
            className="font-heading text-lg font-bold"
            style={{ color: text }}
          >
            {shopName}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {navLinks.map((link, idx) => {
            const isActive = currentPage
              ? link.href === currentPage
              : link.href === "" || link.href === "/";
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onNavClick(link)}
                className="rounded-md px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  color: isActive ? accent : text + "CC",
                }}
              >
                {link.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function PreviewProductGrid({
  products,
  layout,
  colors,
}: {
  products: ProductData[];
  layout: "grid" | "list" | "featured";
  colors: StorefrontColorScheme;
}) {
  const featuredProduct =
    layout === "featured" && products.length > 0 ? products[0] : null;
  const remainingProducts =
    layout === "featured" ? products.slice(1) : products;

  return (
    <div id="products">
      {layout === "featured" && featuredProduct && (
        <div
          className="mb-8 overflow-hidden rounded-xl border-2"
          style={{ borderColor: colors.primary + "33" }}
        >
          <div className="md:flex">
            {featuredProduct.images[0] && (
              <div className="md:w-1/2">
                <img
                  src={featuredProduct.images[0]}
                  alt={featuredProduct.title}
                  className="h-64 w-full object-cover md:h-full"
                />
              </div>
            )}
            <div className="flex flex-col justify-center p-8 md:w-1/2">
              <span
                className="mb-2 text-sm font-semibold tracking-wider uppercase"
                style={{ color: colors.accent }}
              >
                Featured
              </span>
              <h2 className="font-heading text-2xl font-bold md:text-3xl">
                {featuredProduct.title}
              </h2>
              <p className="font-body mt-3 opacity-70">
                {featuredProduct.summary}
              </p>
              <div className="mt-4">
                <span
                  className="text-2xl font-bold"
                  style={{ color: colors.accent }}
                >
                  ${featuredProduct.price}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={
          layout === "list"
            ? "space-y-4"
            : "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {remainingProducts.map((product) => (
          <PreviewProductCard
            key={product.id}
            product={product}
            layout={layout}
            colors={colors}
          />
        ))}
      </div>
    </div>
  );
}

function PreviewProductCard({
  product,
  layout,
  colors,
}: {
  product: ProductData;
  layout: "grid" | "list" | "featured";
  colors: StorefrontColorScheme;
}) {
  if (layout === "list") {
    return (
      <div
        className="flex gap-4 overflow-hidden rounded-xl border-2 p-4 transition-shadow hover:shadow-lg"
        style={{ borderColor: colors.primary + "22" }}
      >
        {product.images[0] && (
          <img
            src={product.images[0]}
            alt={product.title}
            className="h-24 w-24 flex-shrink-0 rounded-lg object-cover"
          />
        )}
        <div className="flex flex-1 flex-col justify-center">
          <h3 className="font-heading text-base font-bold">{product.title}</h3>
          <p className="font-body mt-1 line-clamp-2 text-sm opacity-60">
            {product.summary}
          </p>
          <span
            className="mt-2 text-base font-bold"
            style={{ color: colors.accent }}
          >
            ${product.price}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl border-2 transition-shadow hover:shadow-lg"
      style={{ borderColor: colors.primary + "22" }}
    >
      {product.images[0] && (
        <div className="aspect-square overflow-hidden">
          <img
            src={product.images[0]}
            alt={product.title}
            className="h-full w-full object-cover transition-transform hover:scale-105"
          />
        </div>
      )}
      <div className="p-4">
        <h3 className="font-heading line-clamp-1 text-base font-bold">
          {product.title}
        </h3>
        <p className="font-body mt-1 line-clamp-2 text-sm opacity-60">
          {product.summary}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-lg font-bold" style={{ color: colors.accent }}>
            ${product.price}
          </span>
          <span
            className="rounded-full px-3 py-1 text-xs font-bold"
            style={{
              backgroundColor: colors.primary + "22",
              color: colors.primary,
            }}
          >
            {product.categories[0]}
          </span>
        </div>
      </div>
    </div>
  );
}
