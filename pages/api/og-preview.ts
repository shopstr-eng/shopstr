import type { NextApiRequest, NextApiResponse } from "next";
import { lookup } from "dns/promises";
import net from "net";
import { applyRateLimit } from "@/utils/rate-limit";

// Each call performs an outbound HTTPS fetch + HTML parse; tight per-IP
// cap to prevent us from being used as an SSRF amplifier.
const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 };

type OGData = {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
};

const cache = new Map<string, { data: OGData; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 30;

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)
  ) {
    return true;
  }

  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;

  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized === "::") return true;
  return false;
}

async function isSafePublicHostname(hostname: string): Promise<boolean> {
  const lowered = hostname.toLowerCase();
  if (
    lowered === "localhost" ||
    lowered.endsWith(".localhost") ||
    lowered.endsWith(".local")
  ) {
    return false;
  }

  const ipType = net.isIP(hostname);
  if (ipType === 4) return !isPrivateIPv4(hostname);
  if (ipType === 6) return !isPrivateIPv6(hostname);

  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.length === 0) return false;

    for (const addr of addresses) {
      if (
        (addr.family === 4 && isPrivateIPv4(addr.address)) ||
        (addr.family === 6 && isPrivateIPv6(addr.address))
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function extractMeta(
  html: string,
  property: string,
  attr: "property" | "name" = "property"
): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]+${attr}=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${property}["']`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHTMLEntities(m[1]);
  }
  return undefined;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!applyRateLimit(req, res, "og-preview", RATE_LIMIT)) return;

  const { url } = req.query;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing url" });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: "Invalid protocol" });
    }
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  const isSafeHost = await isSafePublicHostname(parsedUrl.hostname);
  if (!isSafeHost) {
    return res.status(400).json({ error: "URL host is not allowed" });
  }

  const normalizedUrl = parsedUrl.toString();
  const cached = cache.get(normalizedUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    res.setHeader("Cache-Control", "public, max-age=1800");
    return res.status(200).json(cached.data);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(normalizedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Shopstr/1.0; +https://shopstr.store)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(200).json({});
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return res.status(200).json({});
    }

    const html = await response.text();
    const ogData: OGData = {};

    ogData.title =
      extractMeta(html, "og:title") ??
      extractMeta(html, "twitter:title") ??
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

    ogData.description =
      extractMeta(html, "og:description") ??
      extractMeta(html, "twitter:description") ??
      extractMeta(html, "description", "name");

    const rawImage =
      extractMeta(html, "og:image") ??
      extractMeta(html, "og:image:url") ??
      extractMeta(html, "twitter:image");

    if (rawImage) {
      if (rawImage.startsWith("//")) {
        ogData.image = "https:" + rawImage;
      } else if (rawImage.startsWith("/")) {
        ogData.image = `${parsedUrl.protocol}//${parsedUrl.host}${rawImage}`;
      } else {
        ogData.image = rawImage;
      }
    }

    ogData.url = extractMeta(html, "og:url") ?? normalizedUrl;

    if (ogData.title) {
      cache.set(normalizedUrl, { data: ogData, timestamp: Date.now() });
    }

    res.setHeader("Cache-Control", "public, max-age=1800");
    return res.status(200).json(ogData);
  } catch {
    return res.status(200).json({});
  }
}
