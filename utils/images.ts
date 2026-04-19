import { sanitizeUrl } from "@braintree/sanitize-url";

const BLOCKED_URL = "about:blank";
const SAFE_IMAGE_PROTOCOL_RE = /^https?:$/i;
const EXTERNAL_IMAGE_RE = /^https?:\/\//i;
const BLOCKED_LOCAL_IMAGE_PATH_RE = /^\/api\//i;

export function normalizeProductImageUrl(
  image: string | undefined,
  fallback = "/no-image-placeholder.png"
): string {
  const trimmed = image?.trim();
  if (!trimmed) return fallback;

  if (trimmed.startsWith("/")) {
    if (BLOCKED_LOCAL_IMAGE_PATH_RE.test(trimmed)) {
      return fallback;
    }
    return trimmed;
  }

  const sanitized = sanitizeUrl(trimmed);
  if (!sanitized || sanitized === BLOCKED_URL) {
    return fallback;
  }

  if (!EXTERNAL_IMAGE_RE.test(sanitized)) {
    return fallback;
  }

  try {
    const parsed = new URL(sanitized);
    if (!SAFE_IMAGE_PROTOCOL_RE.test(parsed.protocol)) {
      return fallback;
    }

    return `/api/product-image?url=${encodeURIComponent(parsed.toString())}`;
  } catch {
    return fallback;
  }
}

export function normalizeProductImageUrls(
  images: string[] | undefined
): string[] {
  if (!images || images.length === 0) {
    return [];
  }

  return images.map((image) => normalizeProductImageUrl(image));
}

const hostToSrcSet = (url: URL) => {
  const host = url.host;

  // add all known image hosting providers here and configure responsive src formatting
  switch (host) {
    case "image.nostr.build":
      return ["240", "480", "720", "1080"]
        .map((size) => `${url.origin}/resp/${size}p${url.pathname} ${size}w`)
        .join(", ");
    case "i.nostr.build":
      return ["240", "480", "720", "1080"]
        .map((size) => `${url.origin}/resp/${size}p${url.pathname} ${size}w`)
        .join(", ");
    default:
      return url.toString();
  }
};

export const buildSrcSet = (image: string) => {
  try {
    const url = new URL(image);
    return hostToSrcSet(url);
  } catch {
    return image;
  }
};
