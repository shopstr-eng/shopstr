import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@nextui-org/react";
import {
  StorefrontColorScheme,
  StorefrontSection,
  StorefrontPage,
  StorefrontFooter,
  StorefrontNavLink,
} from "@/utils/types/types";
import { getNavTextColor } from "@/utils/storefront-colors";

interface StorefrontPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
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
}

const PLACEHOLDER_PRODUCTS = [
  { name: "Artisan Candle Set", price: "24 USD", tag: "Bestseller" },
  { name: "Handmade Soap Bar", price: "12 USD", tag: "New" },
  { name: "Linen Tote Bag", price: "38 USD", tag: "" },
];

const PLACEHOLDER_TESTIMONIALS = [
  {
    text: "Absolutely love my purchase! Great quality and fast shipping.",
    author: "Sarah M.",
    stars: 5,
  },
  {
    text: "Beautifully packaged, would definitely order again.",
    author: "Jake T.",
    stars: 5,
  },
  {
    text: "Unique products you can't find anywhere else. Highly recommend.",
    author: "Priya K.",
    stars: 5,
  },
];

const PLACEHOLDER_FAQS = [
  {
    q: "Do you ship internationally?",
    a: "Yes, we ship worldwide with tracked delivery.",
  },
  {
    q: "What is your return policy?",
    a: "We accept returns within 30 days of purchase.",
  },
  {
    q: "How long does shipping take?",
    a: "Domestic orders typically arrive in 3–5 business days.",
  },
];

const DEFAULT_NAV_LINKS = ["Shop", "About", "Contact"];

function Stars({ count }: { count: number }) {
  return <span className="text-yellow-400">{"★".repeat(count)}</span>;
}

function SectionPreview({
  section,
  colors,
  fontHeading,
  isPlaceholder,
}: {
  section: StorefrontSection;
  colors: {
    primary: string;
    accent: string;
    text: string;
    background: string;
    secondary: string;
  };
  fontHeading: string;
  isPlaceholder?: boolean;
}) {
  const heading = section.heading || "";
  const body = section.body || "";
  const type = section.type;

  const labelStyle = {
    color: colors.accent,
    fontFamily: fontHeading || "inherit",
  };
  const headingStyle = {
    color: colors.text,
    fontFamily: fontHeading || "inherit",
  };
  const navColorOnPrimary = getNavTextColor(colors.primary);
  const navColorOnAccent = getNavTextColor(colors.accent);
  const navColorOnSecondary = getNavTextColor(colors.secondary);

  const PlaceholderBadge = () =>
    isPlaceholder ? (
      <span
        className="mb-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold opacity-60"
        style={{
          backgroundColor: colors.primary + "22",
          color: colors.primary,
        }}
      >
        example
      </span>
    ) : null;

  if (type === "about" || type === "story") {
    const displayHeading =
      heading || (type === "about" ? "About Us" : "Our Story");
    const displayBody =
      body ||
      "We're a small independent shop passionate about bringing you high-quality, handcrafted products. Every item is made with care and attention to detail.";
    return (
      <div className="px-2 py-6">
        <PlaceholderBadge />
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex-1">
            <p
              className="mb-1 text-xs font-semibold uppercase tracking-widest opacity-60"
              style={labelStyle}
            >
              {type === "about" ? "About" : "Our Story"}
            </p>
            <h3 className="mb-2 text-xl font-bold" style={headingStyle}>
              {displayHeading}
            </h3>
            <p
              className="text-sm leading-relaxed opacity-80"
              style={{ color: colors.text }}
            >
              {displayBody}
            </p>
          </div>
          <div
            className="h-28 w-full flex-shrink-0 rounded-lg md:w-36"
            style={{ backgroundColor: colors.primary + "22" }}
          />
        </div>
      </div>
    );
  }

  if (type === "testimonials" || type === "reviews") {
    const displayHeading = heading || "What Our Customers Say";
    return (
      <div className="px-2 py-6">
        <PlaceholderBadge />
        <h3 className="mb-4 text-center text-xl font-bold" style={headingStyle}>
          {displayHeading}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PLACEHOLDER_TESTIMONIALS.map((t, i) => (
            <div
              key={i}
              className="rounded-lg p-3 text-sm"
              style={{ backgroundColor: colors.primary + "12" }}
            >
              <Stars count={t.stars} />
              <p
                className="mt-1 italic opacity-80"
                style={{ color: colors.text }}
              >
                &ldquo;{t.text}&rdquo;
              </p>
              <p
                className="mt-2 text-xs font-semibold opacity-60"
                style={{ color: colors.text }}
              >
                — {t.author}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "faq") {
    const displayHeading = heading || "Frequently Asked Questions";
    return (
      <div className="px-2 py-6">
        <PlaceholderBadge />
        <h3 className="mb-4 text-center text-xl font-bold" style={headingStyle}>
          {displayHeading}
        </h3>
        <div className="space-y-2">
          {PLACEHOLDER_FAQS.map((item, i) => (
            <div
              key={i}
              className="rounded-lg border px-4 py-3"
              style={{ borderColor: colors.primary + "33" }}
            >
              <p
                className="text-sm font-semibold"
                style={{ color: colors.text }}
              >
                {item.q}
              </p>
              <p
                className="mt-1 text-xs opacity-70"
                style={{ color: colors.text }}
              >
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "hero") {
    const displayHeading = heading || "Welcome to Our Shop";
    const displayBody = body || "Discover our unique handcrafted collection.";
    return (
      <div
        className="flex min-h-[160px] flex-col items-center justify-center px-6 py-10 text-center"
        style={{
          backgroundColor: colors.secondary,
          color: navColorOnSecondary,
        }}
      >
        <PlaceholderBadge />
        <h2
          className="mb-2 text-2xl font-bold"
          style={{ fontFamily: fontHeading || "inherit" }}
        >
          {displayHeading}
        </h2>
        <p className="mb-4 text-sm opacity-90">{displayBody}</p>
        <button
          className="rounded-lg px-5 py-2 text-sm font-bold"
          style={{ backgroundColor: colors.primary, color: colors.secondary }}
        >
          Shop Now
        </button>
      </div>
    );
  }

  if (type === "products") {
    const displayHeading = heading || "Our Products";
    return (
      <div className="px-2 py-6">
        <PlaceholderBadge />
        <h3 className="mb-4 text-xl font-bold" style={headingStyle}>
          {displayHeading}
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {PLACEHOLDER_PRODUCTS.map((product, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg border"
              style={{ borderColor: colors.primary + "33" }}
            >
              <div
                className="relative flex items-center justify-center"
                style={{
                  height: "80px",
                  backgroundColor: colors.primary + "18",
                }}
              >
                {product.tag && (
                  <span
                    className="absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      backgroundColor: colors.accent,
                      color: navColorOnAccent,
                    }}
                  >
                    {product.tag}
                  </span>
                )}
                <div
                  className="h-8 w-8 rounded-full opacity-30"
                  style={{ backgroundColor: colors.primary }}
                />
              </div>
              <div className="p-2">
                <p
                  className="text-xs font-semibold leading-tight"
                  style={{ color: colors.text }}
                >
                  {product.name}
                </p>
                <div className="mt-1 flex items-center justify-between">
                  <span
                    className="text-xs font-bold"
                    style={{ color: colors.accent }}
                  >
                    {product.price}
                  </span>
                  <button
                    className="rounded px-2 py-0.5 text-[10px] font-bold"
                    style={{
                      backgroundColor: colors.primary,
                      color: navColorOnPrimary,
                    }}
                  >
                    Buy
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "ingredients" || type === "comparison") {
    const displayHeading =
      heading || (type === "ingredients" ? "What's Inside" : "Compare Plans");
    const items =
      type === "ingredients"
        ? [
            "Premium Materials",
            "Eco-Friendly",
            "Handcrafted",
            "Long-Lasting",
            "Non-Toxic",
            "Sustainable",
          ]
        : ["Feature A", "Feature B", "Feature C"];
    return (
      <div className="px-2 py-6">
        <PlaceholderBadge />
        <h3 className="mb-4 text-center text-xl font-bold" style={headingStyle}>
          {displayHeading}
        </h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex flex-col items-center rounded-lg p-2 text-center text-xs"
              style={{ backgroundColor: colors.accent + "18" }}
            >
              <div
                className="mb-1 h-8 w-8 rounded-full"
                style={{ backgroundColor: colors.primary + "44" }}
              />
              <span className="font-medium" style={{ color: colors.text }}>
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "contact") {
    const displayHeading = heading || "Get in Touch";
    return (
      <div className="px-2 py-6 text-center">
        <PlaceholderBadge />
        <h3 className="mb-2 text-xl font-bold" style={headingStyle}>
          {displayHeading}
        </h3>
        <p className="mb-3 text-sm opacity-70" style={{ color: colors.text }}>
          {body || "Have a question? We'd love to hear from you."}
        </p>
        <button
          className="rounded-lg px-5 py-2 text-sm font-bold"
          style={{ backgroundColor: colors.primary, color: navColorOnPrimary }}
        >
          Send a Message
        </button>
      </div>
    );
  }

  if (type === "text") {
    const displayHeading = heading || "A Note from Us";
    const displayBody =
      body ||
      "Thank you for supporting our small business. Every purchase means the world to us and helps us continue creating the products we love.";
    return (
      <div className="px-2 py-6 text-center">
        <PlaceholderBadge />
        <h3 className="mb-2 text-xl font-bold" style={headingStyle}>
          {displayHeading}
        </h3>
        <p
          className="mx-auto max-w-lg text-sm leading-relaxed opacity-80"
          style={{ color: colors.text }}
        >
          {displayBody}
        </p>
      </div>
    );
  }

  if (type === "image") {
    return (
      <div className="px-2 py-6">
        <PlaceholderBadge />
        {section.image ? (
          <img
            src={section.image}
            alt={section.caption || ""}
            className={`rounded-lg object-cover ${
              section.fullWidth ? "w-full" : "mx-auto max-w-lg"
            }`}
            style={{
              maxHeight: "240px",
              width: section.fullWidth ? "100%" : undefined,
            }}
          />
        ) : (
          <div
            className="flex h-40 w-full items-center justify-center rounded-lg"
            style={{ backgroundColor: colors.primary + "18" }}
          >
            <span
              className="text-xs opacity-40"
              style={{ color: colors.primary }}
            >
              Image
            </span>
          </div>
        )}
        {section.caption && (
          <p
            className="mt-2 text-center text-xs opacity-60"
            style={{ color: colors.text }}
          >
            {section.caption}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="px-2 py-4 text-center">
      <PlaceholderBadge />
      <p
        className="text-xs font-bold uppercase tracking-widest opacity-50"
        style={{ color: colors.primary }}
      >
        {type} section
      </p>
      {heading && (
        <p className="mt-1 font-bold" style={headingStyle}>
          {heading}
        </p>
      )}
    </div>
  );
}

export default function StorefrontPreviewModal({
  isOpen,
  onClose,
  shopName,
  shopAbout,
  pictureUrl,
  bannerUrl,
  colors,
  productLayout,
  landingPageStyle,
  fontHeading,
  fontBody,
  sections,
  pages: _pages,
  footer,
  navLinks,
  shopSlug,
}: StorefrontPreviewModalProps) {
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

  const enabledSections = sections.filter((s) => s.enabled !== false);

  const defaultPlaceholderSections: StorefrontSection[] = [
    {
      id: "ph-about",
      type: "about",
      enabled: true,
      heading: "",
      body: "",
    },
    {
      id: "ph-testimonials",
      type: "testimonials",
      enabled: true,
      heading: "",
      body: "",
    },
    {
      id: "ph-faq",
      type: "faq",
      enabled: true,
      heading: "",
      body: "",
    },
  ];

  const sectionsToShow =
    enabledSections.length > 0 ? enabledSections : defaultPlaceholderSections;
  const isUsingPlaceholderSections = enabledSections.length === 0;

  const initials = displayShopName
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="5xl"
      scrollBehavior="outside"
      classNames={{
        base: "border-4 border-black rounded-lg",
        body: "p-0",
        header: "border-b-4 border-black bg-white rounded-t-lg",
        footer: "border-t-4 border-black bg-white rounded-b-lg",
        closeButton: "hover:bg-gray-100 active:bg-gray-200",
      }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-3 text-black">
          <span className="text-xl font-bold">Storefront Preview</span>
          <span className="text-sm font-normal text-gray-500">
            (approximate preview — save to see the live version)
          </span>
        </ModalHeader>
        <ModalBody>
          <div
            className="overflow-hidden rounded-b-lg"
            style={{
              backgroundColor: bg,
              color: text,
              fontFamily: fontBody || "inherit",
            }}
          >
            {/* Nav bar */}
            <div
              className="flex items-center gap-3 px-6 py-3"
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

            {/* Hero / header — only shown as fallback when no sections are configured */}
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

            {/* Sections — rendered in their exact configured order */}
            <div style={{ backgroundColor: bg }}>
              {isUsingPlaceholderSections && (
                <div
                  className="flex items-center gap-2 border-b px-6 py-2"
                  style={{
                    borderColor: primary + "22",
                    backgroundColor: primary + "08",
                  }}
                >
                  <span
                    className="text-xs opacity-60"
                    style={{ color: primary }}
                  >
                    ✦ No sections added yet — showing example layout below
                  </span>
                </div>
              )}
              {sectionsToShow.map((section, i) => (
                <div key={section.id || i}>
                  {i > 0 && section.type !== "hero" && (
                    <hr style={{ borderColor: primary + "18" }} />
                  )}
                  {section.type === "hero" ? (
                    <SectionPreview
                      section={section}
                      colors={colorSet}
                      fontHeading={fontHeading}
                      isPlaceholder={isUsingPlaceholderSections}
                    />
                  ) : (
                    <div className="px-6">
                      <SectionPreview
                        section={section}
                        colors={colorSet}
                        fontHeading={fontHeading}
                        isPlaceholder={isUsingPlaceholderSections}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Products grid — only shown as fallback when no sections are configured */}
            {isUsingPlaceholderSections && (
              <div
                className="px-6 py-6"
                style={{
                  backgroundColor: bg,
                  borderTop: `1px solid ${primary}22`,
                }}
              >
                <h2
                  className="mb-4 text-lg font-bold"
                  style={{
                    fontFamily: fontHeading || "inherit",
                    color: primary,
                  }}
                >
                  Products
                </h2>
                <div
                  className={
                    productLayout === "list"
                      ? "flex flex-col gap-3"
                      : "grid grid-cols-3 gap-3"
                  }
                >
                  {PLACEHOLDER_PRODUCTS.map((product, i) => (
                    <div
                      key={i}
                      className="overflow-hidden rounded-lg border"
                      style={{ borderColor: primary + "33" }}
                    >
                      <div
                        className="relative flex items-center justify-center"
                        style={{
                          height: productLayout === "list" ? "60px" : "80px",
                          backgroundColor: primary + "18",
                        }}
                      >
                        {product.tag && (
                          <span
                            className="absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                            style={{
                              backgroundColor: accent,
                              color: accentTextColor,
                            }}
                          >
                            {product.tag}
                          </span>
                        )}
                        <div
                          className="h-8 w-8 rounded-full opacity-30"
                          style={{ backgroundColor: primary }}
                        />
                      </div>
                      <div className="p-2">
                        <p
                          className="text-xs font-semibold leading-tight"
                          style={{ color: text }}
                        >
                          {product.name}
                        </p>
                        <div className="mt-1 flex items-center justify-between">
                          <span
                            className="text-xs font-bold"
                            style={{ color: accent }}
                          >
                            {product.price}
                          </span>
                          <button
                            className="rounded px-2 py-0.5 text-[10px] font-bold"
                            style={{
                              backgroundColor: primary,
                              color: primaryTextColor,
                            }}
                          >
                            Buy
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div
              className="px-8 py-5"
              style={{ backgroundColor: secondary, color: navTextColor }}
            >
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="text-sm font-bold">{displayShopName}</span>
                {footer.text ? (
                  <p className="text-xs opacity-70">{footer.text}</p>
                ) : (
                  <p className="text-xs opacity-50">
                    {displayAbout.slice(0, 60)}
                    {displayAbout.length > 60 ? "…" : ""}
                  </p>
                )}
                {footer.showPoweredBy !== false && (
                  <p className="mt-1 text-[10px] opacity-40">
                    Powered by Shopstr
                  </p>
                )}
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter className="flex justify-between">
          {shopSlug ? (
            <a
              href={`/shop/${shopSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-bold text-shopstr-purple underline dark:text-shopstr-yellow"
            >
              Open live storefront →
            </a>
          ) : (
            <span className="text-sm text-gray-400">
              Save a shop URL to see your live storefront
            </span>
          )}
          <Button
            onPress={onClose}
            className="border-2 border-black bg-white font-bold text-black hover:bg-gray-100"
          >
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
