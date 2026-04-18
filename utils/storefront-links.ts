import { sanitizeUrl } from "@braintree/sanitize-url";
import {
  StorefrontConfig,
  StorefrontFooter,
  StorefrontNavLink,
  StorefrontPage,
  StorefrontSection,
  StorefrontSocialLink,
} from "@/utils/types/types";

const BLOCKED_URL = "about:blank";
const ABSOLUTE_SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const EXTERNAL_HREF_RE = /^(https?:|mailto:|tel:)/i;

function hasBlockedScheme(value: string): boolean {
  return /^(javascript|vbscript|data|file):/i.test(value.trim());
}

function normalizeRelativeShopPath(value: string, shopSlug: string): string {
  const trimmed = value.trim().replace(/^\/+/, "");
  return shopSlug ? `/shop/${shopSlug}/${trimmed}` : `/${trimmed}`;
}

export function sanitizeStorefrontHref(
  value: string | undefined,
  fallback: string
): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("#")) return trimmed;
  if (hasBlockedScheme(trimmed)) return fallback;

  const sanitized = sanitizeUrl(trimmed);
  if (!sanitized || sanitized === BLOCKED_URL) return fallback;

  return sanitized;
}

export function sanitizeStorefrontSectionLink(
  value: string | undefined,
  fallback = "#products"
): string {
  return sanitizeStorefrontHref(value, fallback);
}

export function sanitizeStorefrontSocialLink(
  value: string | undefined,
  fallback = "#"
): string {
  return sanitizeStorefrontHref(value, fallback);
}

export function sanitizeStorefrontNavHref(
  link: StorefrontNavLink,
  shopSlug: string,
  fallback?: string
): string {
  const safeFallback = fallback || (shopSlug ? `/shop/${shopSlug}` : "/");
  const trimmed = link.href?.trim();

  if (!trimmed) return safeFallback;
  if (link.isPage) return normalizeRelativeShopPath(trimmed, shopSlug);
  if (trimmed.startsWith("#")) return trimmed;
  if (trimmed.startsWith("/")) return sanitizeStorefrontHref(trimmed, safeFallback);
  if (ABSOLUTE_SCHEME_RE.test(trimmed)) {
    return sanitizeStorefrontHref(trimmed, safeFallback);
  }

  return sanitizeStorefrontHref(
    normalizeRelativeShopPath(trimmed, shopSlug),
    safeFallback
  );
}

export function isExternalStorefrontHref(href: string): boolean {
  return EXTERNAL_HREF_RE.test(href);
}

function sanitizeSection(section: StorefrontSection): StorefrontSection {
  if (!section.ctaLink) return section;

  return {
    ...section,
    ctaLink: sanitizeStorefrontSectionLink(section.ctaLink),
  };
}

function sanitizePage(page: StorefrontPage): StorefrontPage {
  return {
    ...page,
    sections: page.sections.map(sanitizeSection),
  };
}

function sanitizeFooter(footer: StorefrontFooter, shopSlug: string): StorefrontFooter {
  return {
    ...footer,
    socialLinks: footer.socialLinks?.map(
      (link): StorefrontSocialLink => ({
        ...link,
        url: sanitizeStorefrontSocialLink(link.url),
      })
    ),
    navLinks: footer.navLinks?.map(
      (link): StorefrontNavLink => ({
        ...link,
        href: sanitizeStorefrontNavHref(link, shopSlug),
      })
    ),
  };
}

export function sanitizeStorefrontConfigLinks(
  storefront: StorefrontConfig
): StorefrontConfig {
  const shopSlug = storefront.shopSlug || "";

  return {
    ...storefront,
    sections: storefront.sections?.map(sanitizeSection),
    pages: storefront.pages?.map(sanitizePage),
    navLinks: storefront.navLinks?.map(
      (link): StorefrontNavLink => ({
        ...link,
        href: sanitizeStorefrontNavHref(link, shopSlug),
      })
    ),
    footer: storefront.footer
      ? sanitizeFooter(storefront.footer, shopSlug)
      : storefront.footer,
  };
}
