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
const SECTION_CTA_SCHEME_RE = /^https?:/i;
const BLOCKED_SCHEME_RE = /^(javascript|vbscript|data|file|blob):/i;
const STRIP_INVISIBLE_RE =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\uFEFF\s]/g;

function stripInvisible(value: string): string {
  return value.replace(STRIP_INVISIBLE_RE, "");
}

function hasBlockedScheme(value: string): boolean {
  return BLOCKED_SCHEME_RE.test(stripInvisible(value));
}

function safeSegment(segment: string): string {
  if (!segment || segment === "." || segment === "..") return "";
  try {
    return encodeURIComponent(decodeURIComponent(segment));
  } catch {
    return encodeURIComponent(segment);
  }
}

function normalizeRelativeShopPath(value: string, shopSlug: string): string {
  const trimmed = value.trim();
  const parts = trimmed.split(/[?#]/);
  const pathPart = parts[0] ?? "";
  const suffix = parts.length > 1 ? trimmed.slice(pathPart.length) : "";
  const segments = pathPart
    .replace(/^\/+/, "")
    .split("/")
    .map(safeSegment)
    .filter(Boolean);
  const safePath = segments.join("/");
  const base = shopSlug ? `/shop/${shopSlug}` : "";
  if (!safePath) return base || "/";
  return `${base}/${safePath}${suffix}`;
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
  if (hasBlockedScheme(sanitized)) return fallback;

  return sanitized;
}

export function sanitizeStorefrontSectionLink(
  value: string | undefined,
  fallback = "#products"
): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("#")) return trimmed;
  if (trimmed.startsWith("/")) {
    const sanitized = sanitizeStorefrontHref(trimmed, fallback);
    return sanitized.startsWith("/") ? sanitized : fallback;
  }
  const cleaned = stripInvisible(trimmed);
  if (!SECTION_CTA_SCHEME_RE.test(cleaned)) return fallback;
  return sanitizeStorefrontHref(trimmed, fallback);
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
  if (trimmed.startsWith("/")) {
    if (hasBlockedScheme(trimmed)) return safeFallback;
    return sanitizeStorefrontHref(trimmed, safeFallback);
  }
  if (ABSOLUTE_SCHEME_RE.test(stripInvisible(trimmed))) {
    return sanitizeStorefrontHref(trimmed, safeFallback);
  }

  return normalizeRelativeShopPath(trimmed, shopSlug);
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

function sanitizeFooter(
  footer: StorefrontFooter,
  shopSlug: string
): StorefrontFooter {
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
