import { useEffect } from "react";
import {
  StorefrontColorScheme,
  StorefrontSection,
  StorefrontPage,
  StorefrontFooter,
  StorefrontNavLink,
} from "@/utils/types/types";
import StorefrontPreviewPanel from "./storefront-preview-panel";

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
  currentPreviewPage?: string;
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
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/70">
      <div className="absolute top-3 right-4 z-50">
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 text-lg text-white transition-colors hover:bg-gray-600"
        >
          ✕
        </button>
      </div>
      <StorefrontPreviewPanel
        shopName={shopName}
        shopAbout={shopAbout}
        pictureUrl={pictureUrl}
        bannerUrl={bannerUrl}
        colors={colors}
        productLayout={productLayout}
        landingPageStyle={landingPageStyle}
        fontHeading={fontHeading}
        fontBody={fontBody}
        sections={sections}
        pages={pages}
        footer={footer}
        navLinks={navLinks}
        shopSlug={shopSlug}
      />
    </div>
  );
}
