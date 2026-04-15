import { useState } from "react";
import {
  StorefrontColorScheme,
  StorefrontNavColors,
  StorefrontNavLink,
} from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";
import Link from "next/link";

interface StorefrontNavProps {
  shopName: string;
  pictureUrl: string;
  colors: StorefrontColorScheme;
  navColors?: StorefrontNavColors;
  navLinks: StorefrontNavLink[];
  shopSlug: string;
  currentPage?: string;
}

export default function StorefrontNav({
  shopName,
  pictureUrl,
  colors,
  navColors,
  navLinks,
  shopSlug,
  currentPage,
}: StorefrontNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const bg = navColors?.background || colors.secondary;
  const text = navColors?.text || colors.background;
  const accent = navColors?.accent || colors.primary;

  const resolveHref = (link: StorefrontNavLink) => {
    if (link.isPage) return `/shop/${shopSlug}/${link.href}`;
    if (link.href.startsWith("/") || link.href.startsWith("http"))
      return link.href;
    return `/shop/${shopSlug}/${link.href}`;
  };

  return (
    <nav
      className="fixed top-0 right-0 left-0 z-50 border-b"
      style={{
        backgroundColor: bg,
        borderColor: accent + "33",
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
        <Link href={`/shop/${shopSlug}`} className="flex items-center gap-3">
          {pictureUrl && (
            <img
              src={sanitizeUrl(pictureUrl)}
              alt={shopName}
              className="h-8 w-8 rounded-full object-cover"
              fetchPriority="high"
            />
          )}
          <span
            className="font-heading text-lg font-bold"
            style={{ color: text }}
          >
            {shopName}
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link, idx) => {
            const href = resolveHref(link);
            const isActive = currentPage
              ? link.href === currentPage
              : link.href === "" || link.href === "/";
            return (
              <Link
                key={idx}
                href={href}
                className="rounded-md px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  color: isActive ? accent : text + "CC",
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <button
          className="flex h-8 w-8 items-center justify-center rounded md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          style={{ color: text }}
        >
          {mobileOpen ? (
            <span className="text-xl">✕</span>
          ) : (
            <span className="text-xl">☰</span>
          )}
        </button>
      </div>

      {mobileOpen && (
        <div
          className="border-t md:hidden"
          style={{
            backgroundColor: bg,
            borderColor: accent + "22",
          }}
        >
          {navLinks.map((link, idx) => {
            const href = resolveHref(link);
            return (
              <Link
                key={idx}
                href={href}
                className="block px-6 py-3 text-sm font-medium"
                style={{ color: text + "CC" }}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
