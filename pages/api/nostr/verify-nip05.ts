import type { NextApiRequest, NextApiResponse } from "next";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const HOSTNAME_REGEX =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/i;

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;

  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  // Handle IPv4-mapped IPv6 addresses, e.g. ::ffff:127.0.0.1
  if (normalized.startsWith("::ffff:")) {
    const ipv4 = normalized.replace("::ffff:", "");
    return isPrivateIPv4(ipv4);
  }

  return false;
}

function isInternalAddress(address: string): boolean {
  const ipType = isIP(address);
  if (ipType === 4) return isPrivateIPv4(address);
  if (ipType === 6) return isPrivateIPv6(address);
  return true;
}

function normalizeDomain(domain: string): string | null {
  const normalized = domain.trim().toLowerCase();

  if (!normalized) return null;
  if (normalized.includes("/") || normalized.includes("?") || normalized.includes("#")) {
    return null;
  }
  if (normalized.includes(":")) return null; // disallow explicit ports
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return null;
  }
  if (normalized.endsWith(".local")) return null;
  if (isIP(normalized) !== 0) return null; // disallow IP literals
  if (!HOSTNAME_REGEX.test(normalized)) return null;

  return normalized;
}

async function isPublicResolvableHost(hostname: string): Promise<boolean> {
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!records.length) return false;
    return records.every((record) => !isInternalAddress(record.address));
  } catch {
    return false;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let { nip05, pubkey } = req.query;

  if (Array.isArray(nip05)) nip05 = nip05[0];
  if (Array.isArray(pubkey)) pubkey = pubkey[0];

  if (typeof nip05 !== "string" || typeof pubkey !== "string") {
    return res.status(400).json({ error: "Missing nip05 or pubkey" });
  }

  // According to NIP-05 spec, if there is no username (no '@'), we assume '_@domain'
  if (!nip05.includes("@")) {
    nip05 = `_@${nip05}`;
  }

  try {
    const parts = nip05.split("@");
    if (parts.length !== 2) {
      return res.status(400).json({ verified: false, error: "Invalid format" });
    }

    const [username, domain] = parts;
    if (!username || !domain) {
      return res
        .status(400)
        .json({ verified: false, error: "Invalid username or domain" });
    }

    const trimmedUsername = username.trim();
    const normalizedDomain = normalizeDomain(domain);
    if (!trimmedUsername || !normalizedDomain) {
      return res.status(400).json({ verified: false, error: "Invalid username or domain" });
    }

    const hostIsPublic = await isPublicResolvableHost(normalizedDomain);
    if (!hostIsPublic) {
      return res.status(200).json({ verified: false });
    }

    const targetUrl = new URL("/.well-known/nostr.json", `https://${normalizedDomain}`);
    targetUrl.searchParams.set("name", trimmedUsername);

    // Enforce strict NIP-05 endpoint and HTTPS only.
    if (
      targetUrl.protocol !== "https:" ||
      targetUrl.pathname !== "/.well-known/nostr.json"
    ) {
      return res.status(400).json({ verified: false, error: "Invalid verification URL" });
    }

    // Server-side fetch (bypasses browser CORS policy)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return res.status(200).json({ verified: false });
    }

    const data = await response.json();
    if (!data || typeof data !== "object") {
      return res.status(200).json({ verified: false });
    }

    const names = data.names || {};
    const verified =
      names[trimmedUsername] === pubkey ||
      names[trimmedUsername.toLowerCase()] === pubkey;

    // Cache the result briefly to avoid spamming the target domain
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ verified });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`NIP-05 verification proxy timeout for ${nip05}`);
    } else {
      console.error("NIP-05 verification proxy error:", error);
    }
    // Return 200 with verified: false so fetching logic cleanly handles it without throwing
    return res.status(200).json({ verified: false });
  }
}
