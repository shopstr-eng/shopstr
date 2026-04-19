import type { NextApiRequest, NextApiResponse } from "next";
import { lookup } from "dns/promises";
import net from "net";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 120, windowMs: 60 * 1000 };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

function getRequestHostname(req: NextApiRequest): string | null {
  const forwardedHost = req.headers["x-forwarded-host"];
  const rawHost = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.headers.host;

  if (!rawHost) return null;

  return rawHost.split(":")[0]?.toLowerCase() || null;
}

function isDisallowedShopstrApiTarget(
  req: NextApiRequest,
  parsedUrl: URL
): boolean {
  const requestHostname = getRequestHostname(req);
  if (!requestHostname) return false;

  return (
    parsedUrl.hostname.toLowerCase() === requestHostname &&
    parsedUrl.pathname.startsWith("/api/")
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!applyRateLimit(req, res, "product-image", RATE_LIMIT)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
    if (parsedUrl.port && !["80", "443"].includes(parsedUrl.port)) {
      return res.status(400).json({ error: "Invalid port" });
    }
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  const isSafeHost = await isSafePublicHostname(parsedUrl.hostname);
  if (!isSafeHost) {
    return res.status(400).json({ error: "URL host is not allowed" });
  }

  if (isDisallowedShopstrApiTarget(req, parsedUrl)) {
    return res.status(400).json({ error: "URL path is not allowed" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Shopstr/1.0; +https://shopstr.store)",
        Accept: "image/*",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(400).json({ error: "Failed to fetch image" });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return res.status(400).json({ error: "Invalid image response" });
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: "Image too large" });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: "Image too large" });
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(buffer);
  } catch {
    return res.status(400).json({ error: "Failed to fetch image" });
  }
}
