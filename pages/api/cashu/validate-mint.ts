import type { NextApiRequest, NextApiResponse } from "next";
import { lookup } from "dns/promises";
import net from "net";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 120, windowMs: 60 * 1000 };
const MAX_MINT_URL_LENGTH = 500;
const FETCH_TIMEOUT_MS = 6000;
const MAX_JSON_BYTES = 1024 * 1024;
const BROWSER_CORS_ERROR =
  "Mint does not allow browser wallet requests; use a mint with valid CORS headers.";
const DISCOVERY_ERROR = "Could not validate mint discovery endpoints";

function allowsLocalMintValidation(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.CASHU_MINT_VALIDATION_ALLOW_LOCAL === "true"
  );
}

type ValidateMintSuccess = {
  ok: true;
  mintUrl: string;
  nuts?: Record<string, unknown>;
  keysetCount?: number;
};

type ValidateMintError = {
  error: string;
};

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
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIPv4(normalized.slice("::ffff:".length));
  }
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

    return addresses.every((addr) => {
      if (addr.family === 4) return !isPrivateIPv4(addr.address);
      if (addr.family === 6) return !isPrivateIPv6(addr.address);
      return false;
    });
  } catch {
    return false;
  }
}

function normalizeMintUrl(rawMintUrl: unknown): string | null {
  if (typeof rawMintUrl !== "string") return null;

  const trimmed = rawMintUrl.trim();
  if (!trimmed || trimmed.length > MAX_MINT_URL_LENGTH) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!["https:", "http:"].includes(parsed.protocol)) return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.search || parsed.hash) return null;
  if (
    parsed.port &&
    !["80", "443"].includes(parsed.port) &&
    !allowsLocalMintValidation()
  )
    return null;

  const normalizedPath = parsed.pathname.replace(/\/+$/, "");
  return normalizedPath && normalizedPath !== "/"
    ? `${parsed.origin}${normalizedPath}`
    : parsed.origin;
}

function getServerMintAllowlist(): Set<string> | null {
  const configured = process.env.CASHU_MINT_VALIDATION_ALLOWED_MINTS;
  if (!configured?.trim()) return null;

  const allowedMints = configured
    .split(",")
    .map((entry) => normalizeMintUrl(entry))
    .filter((entry): entry is string => Boolean(entry));

  return new Set(allowedMints);
}

function isMintAllowedByServerConfig(mintUrl: string): boolean {
  const allowlist = getServerMintAllowlist();
  return !allowlist || allowlist.has(mintUrl);
}

function mintEndpoint(mintUrl: string, path: string): string {
  const base = mintUrl.endsWith("/") ? mintUrl : `${mintUrl}/`;
  return new URL(path.replace(/^\/+/, ""), base).toString();
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getRequestOrigin(req: NextApiRequest): string {
  const origin = headerValue(req.headers.origin);
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return parsed.origin;
      }
    } catch {
      // Fall through to reconstructing the origin from forwarded headers.
    }
  }

  const host = headerValue(req.headers.host) ?? "localhost";
  const forwardedProto = headerValue(req.headers["x-forwarded-proto"]);
  const proto =
    forwardedProto?.split(",")[0]?.trim() === "https" ? "https" : "http";
  return `${proto}://${host}`;
}

function getResponseHeader(response: Response, name: string): string | null {
  return response.headers.get(name);
}

function hasBrowserCors(response: Response, requestOrigin: string): boolean {
  const allowOrigin = getResponseHeader(
    response,
    "access-control-allow-origin"
  );
  const normalized = allowOrigin?.trim();
  if (!normalized || normalized.includes(",")) return false;
  return normalized === "*" || normalized === requestOrigin;
}

type MintFetchResult =
  { ok: true; json: unknown } | { ok: false; reason: "cors" | "request" };

async function fetchJson(
  endpoint: string,
  requestOrigin: string
): Promise<MintFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        Accept: "application/json",
        Origin: requestOrigin,
        "User-Agent": "Shopstr/1.0 Cashu mint validator",
      },
    });

    if (!response.ok) return { ok: false, reason: "request" };
    if (!hasBrowserCors(response, requestOrigin)) {
      return { ok: false, reason: "cors" };
    }

    const body = await response.text();
    if (body.length > MAX_JSON_BYTES) return { ok: false, reason: "request" };

    return { ok: true, json: JSON.parse(body) as unknown };
  } catch {
    return { ok: false, reason: "request" };
  } finally {
    clearTimeout(timeout);
  }
}

function getNuts(info: unknown): Record<string, unknown> | undefined {
  if (!info || typeof info !== "object" || Array.isArray(info)) {
    return undefined;
  }

  const nuts = (info as { nuts?: unknown }).nuts;
  return nuts && typeof nuts === "object" && !Array.isArray(nuts)
    ? (nuts as Record<string, unknown>)
    : undefined;
}

function getKeysetIdCount(keysetsResponse: unknown): number | null {
  if (
    !keysetsResponse ||
    typeof keysetsResponse !== "object" ||
    Array.isArray(keysetsResponse)
  ) {
    return null;
  }

  const keysets = (keysetsResponse as { keysets?: unknown }).keysets;
  if (!Array.isArray(keysets) || keysets.length === 0) return null;

  const hasUsableKeysetId = keysets.some((keyset) => {
    if (!keyset || typeof keyset !== "object" || Array.isArray(keyset)) {
      return false;
    }
    const id = (keyset as { id?: unknown }).id;
    return typeof id === "string" && id.length > 0;
  });

  return hasUsableKeysetId ? keysets.length : null;
}

function getV1KeysetCount(keysResponse: unknown): number | null {
  if (
    !keysResponse ||
    typeof keysResponse !== "object" ||
    Array.isArray(keysResponse)
  ) {
    return null;
  }

  const keysets = (keysResponse as { keysets?: unknown }).keysets;
  if (!Array.isArray(keysets) || keysets.length === 0) return null;

  const hasUsableKeyset = keysets.some((keyset) => {
    if (!keyset || typeof keyset !== "object" || Array.isArray(keyset)) {
      return false;
    }
    const keys = (keyset as { keys?: unknown }).keys;
    return !!keys && typeof keys === "object" && Object.keys(keys).length > 0;
  });

  return hasUsableKeyset ? keysets.length : null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ValidateMintSuccess | ValidateMintError>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "validate-cashu-mint", RATE_LIMIT)) return;

  const mintUrl = normalizeMintUrl(req.body?.mintUrl);
  if (!mintUrl) {
    return res.status(400).json({ error: "Invalid mint URL" });
  }

  if (!isMintAllowedByServerConfig(mintUrl)) {
    return res.status(400).json({ error: "Mint is not allowed" });
  }

  let hostname: string;
  try {
    hostname = new URL(mintUrl).hostname;
  } catch {
    return res.status(400).json({ error: "Invalid mint URL" });
  }

  if (!allowsLocalMintValidation() && !(await isSafePublicHostname(hostname))) {
    return res.status(400).json({ error: "Mint host is not allowed" });
  }

  const requestOrigin = getRequestOrigin(req);

  const info = await fetchJson(mintEndpoint(mintUrl, "v1/info"), requestOrigin);
  if (!info.ok) {
    return res.status(400).json({
      error: info.reason === "cors" ? BROWSER_CORS_ERROR : DISCOVERY_ERROR,
    });
  }
  const nuts = getNuts(info.json);

  const keysets = await fetchJson(
    mintEndpoint(mintUrl, "v1/keysets"),
    requestOrigin
  );
  if (!keysets.ok) {
    return res.status(400).json({
      error: keysets.reason === "cors" ? BROWSER_CORS_ERROR : DISCOVERY_ERROR,
    });
  }

  const keysetCount = getKeysetIdCount(keysets.json);
  if (keysetCount === null) {
    return res.status(400).json({ error: DISCOVERY_ERROR });
  }

  const v1Keys = await fetchJson(
    mintEndpoint(mintUrl, "v1/keys"),
    requestOrigin
  );
  if (!v1Keys.ok) {
    return res.status(400).json({
      error: v1Keys.reason === "cors" ? BROWSER_CORS_ERROR : DISCOVERY_ERROR,
    });
  }

  if (getV1KeysetCount(v1Keys.json) === null) {
    return res.status(400).json({ error: "Could not validate mint keys" });
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    mintUrl,
    ...(nuts ? { nuts } : {}),
    keysetCount,
  });
}
