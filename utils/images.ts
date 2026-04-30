import { sanitizeUrl } from "@braintree/sanitize-url";

const BLOCKED_URL = "about:blank";
const SAFE_IMAGE_PROTOCOL_RE = /^https?:$/i;
const EXTERNAL_IMAGE_RE = /^https?:\/\//i;
const BLOCKED_LOCAL_IMAGE_PATH_RE = /^\/api\//i;
const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function isPrivateIPv4Literal(hostname: string): boolean {
  if (!IPV4_RE.test(hostname)) return false;

  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }

  const [a, b] = parts as [number, number, number, number];

  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;

  return false;
}

function isPrivateIPv6Literal(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  return false;
}

function isBlockedRemoteImageHost(hostname: string): boolean {
  const lowered = hostname.toLowerCase();

  if (
    lowered === "localhost" ||
    lowered.endsWith(".localhost") ||
    lowered.endsWith(".local")
  ) {
    return true;
  }

  return isPrivateIPv4Literal(lowered) || isPrivateIPv6Literal(lowered);
}

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

    if (isBlockedRemoteImageHost(parsed.hostname)) {
      return fallback;
    }

    return parsed.toString();
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
