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
  pages,
  footer,
  navLinks,
  shopSlug,
}: StorefrontPreviewModalProps) {
  const primaryColor = colors.primary || "#a438ba";
  const bgColor = colors.background || "#ffffff";
  const textColor = colors.text || "#212121";
  const secondaryColor = colors.secondary || "#212121";
  const accentColor = colors.accent || "#a655f7";

  const navStyle = {
    backgroundColor: secondaryColor,
    color: "#ffffff",
    fontFamily: fontHeading || "inherit",
  };

  const headerStyle = {
    backgroundColor: primaryColor,
    color: "#ffffff",
    fontFamily: fontHeading || "inherit",
  };

  const bodyStyle = {
    backgroundColor: bgColor,
    color: textColor,
    fontFamily: fontBody || "inherit",
  };

  const ctaStyle = {
    backgroundColor: accentColor,
    color: "#ffffff",
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="5xl"
      scrollBehavior="outside"
      classNames={{
        base: "border-4 border-black shadow-neo rounded-lg",
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
          <div className="overflow-hidden rounded-b-lg">
            {/* Simulated nav bar */}
            <div
              className="flex items-center gap-4 px-6 py-3 text-sm font-bold"
              style={navStyle}
            >
              {pictureUrl && (
                <img
                  src={pictureUrl}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                />
              )}
              <span className="text-lg">{shopName || "Your Shop Name"}</span>
              {navLinks.length > 0 && (
                <div className="ml-auto flex gap-4">
                  {navLinks.slice(0, 4).map((link, i) => (
                    <span
                      key={i}
                      className="cursor-pointer opacity-80 hover:opacity-100"
                    >
                      {link.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Hero / header area */}
            {landingPageStyle === "hero" ? (
              <div
                className="relative flex min-h-[200px] items-center justify-center overflow-hidden"
                style={headerStyle}
              >
                {bannerUrl && (
                  <img
                    src={bannerUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ opacity: 0.4 }}
                  />
                )}
                <div className="relative z-10 px-8 py-12 text-center">
                  <h1
                    className="mb-3 text-4xl font-bold"
                    style={{ fontFamily: fontHeading || "inherit" }}
                  >
                    {shopName || "Your Shop Name"}
                  </h1>
                  <p className="mb-6 text-lg opacity-90">
                    {shopAbout || "Your shop description goes here."}
                  </p>
                  <button
                    className="rounded-lg px-6 py-2.5 text-sm font-bold"
                    style={ctaStyle}
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
                    className="h-48 w-full"
                    style={{ backgroundColor: primaryColor, opacity: 0.3 }}
                  />
                )}
                <div
                  className="px-8 py-6 text-center"
                  style={{
                    ...bodyStyle,
                    borderBottom: `4px solid ${primaryColor}`,
                  }}
                >
                  <h1
                    className="mb-2 text-3xl font-bold"
                    style={{ fontFamily: fontHeading || "inherit" }}
                  >
                    {shopName || "Your Shop Name"}
                  </h1>
                  <p className="text-base opacity-80">
                    {shopAbout || "Your shop description goes here."}
                  </p>
                </div>
              </div>
            ) : (
              <div
                className="border-b-4 border-black px-8 py-8"
                style={bodyStyle}
              >
                <div className="flex items-center gap-4">
                  {pictureUrl && (
                    <img
                      src={pictureUrl}
                      alt=""
                      className="h-16 w-16 rounded-full border-2 border-black object-cover"
                    />
                  )}
                  <div>
                    <h1
                      className="text-3xl font-bold"
                      style={{
                        fontFamily: fontHeading || "inherit",
                        color: primaryColor,
                      }}
                    >
                      {shopName || "Your Shop Name"}
                    </h1>
                    <p className="text-sm opacity-70">
                      {shopAbout || "Your shop description goes here."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Custom sections preview */}
            {sections.filter((s) => s.enabled !== false).length > 0 && (
              <div style={bodyStyle} className="space-y-6 px-8 py-6">
                {sections
                  .filter((s) => s.enabled !== false)
                  .slice(0, 3)
                  .map((section) => (
                    <div
                      key={section.id}
                      className="rounded-lg border-2 border-dashed border-gray-300 p-4 text-center"
                    >
                      <span
                        className="text-xs font-bold uppercase tracking-wider"
                        style={{ color: primaryColor }}
                      >
                        [{section.type.toUpperCase()} SECTION]
                      </span>
                      {section.heading && (
                        <p
                          className="mt-1 font-bold"
                          style={{
                            fontFamily: fontHeading || "inherit",
                            color: textColor,
                          }}
                        >
                          {section.heading}
                        </p>
                      )}
                    </div>
                  ))}
                {sections.filter((s) => s.enabled !== false).length > 3 && (
                  <p className="text-center text-xs text-gray-400">
                    +{sections.filter((s) => s.enabled !== false).length - 3}{" "}
                    more section(s)
                  </p>
                )}
              </div>
            )}

            {/* Products area */}
            <div className="px-8 py-6" style={bodyStyle}>
              <h2
                className="mb-4 text-xl font-bold"
                style={{
                  fontFamily: fontHeading || "inherit",
                  color: primaryColor,
                }}
              >
                Products
              </h2>
              <div
                className={
                  productLayout === "list"
                    ? "space-y-3"
                    : "grid grid-cols-3 gap-3"
                }
              >
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="rounded-lg border-2 border-black p-3"
                    style={{ boxShadow: "3px 3px 0 black" }}
                  >
                    <div
                      className="mb-2 h-24 rounded"
                      style={{ backgroundColor: `${primaryColor}30` }}
                    />
                    <div className="h-3 rounded bg-gray-200" />
                    <div className="mt-1 h-3 w-2/3 rounded bg-gray-100" />
                    <div
                      className="mt-2 rounded px-2 py-1 text-center text-xs font-bold"
                      style={ctaStyle}
                    >
                      Buy
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div
              className="px-8 py-4 text-center text-sm"
              style={{ backgroundColor: secondaryColor, color: "#ffffff" }}
            >
              {footer.text && <p className="mb-1 opacity-80">{footer.text}</p>}
              {footer.showPoweredBy !== false && (
                <p className="text-xs opacity-60">Powered by Shopstr</p>
              )}
            </div>
          </div>
        </ModalBody>
        <ModalFooter className="flex justify-between">
          {shopSlug ? (
            <a
              href={`/shop/${shopSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-bold text-blue-600 underline"
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
