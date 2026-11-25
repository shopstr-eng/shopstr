import { lookup } from "dns/promises";
import net from "net";

const MAX_MINT_URL_LENGTH = 500;

export type SafeMintUrlResult =
  | { ok: true; mintUrl: string }
  | {
      ok: false;
      error:
        "Invalid mint URL" | "Mint is not allowed" | "Mint host is not allowed";
    };

// Local/private mints (e.g. a fake mint for E2E tests) are only accepted
// outside production and only when explicitly enabled. In production the flag
// is ignored and the SSRF controls below always apply.
export function isLocalMintValidationAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.CASHU_MINT_VALIDATION_ALLOW_LOCAL === "true"
  );
}

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
  if (/^fe[89ab]/.test(normalized)) return true;
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

  // URL keeps the brackets around IPv6 literals, which net.isIP rejects.
  const literal =
    lowered.startsWith("[") && lowered.endsWith("]")
      ? lowered.slice(1, -1)
      : lowered;
  const ipType = net.isIP(literal);
  if (ipType === 4) return !isPrivateIPv4(literal);
  if (ipType === 6) return !isPrivateIPv6(literal);

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

export function normalizeMintUrl(rawMintUrl: unknown): string | null {
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
    !isLocalMintValidationAllowed()
  ) {
    return null;
  }

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

/**
 * Normalizes a caller-supplied mint URL and rejects anything the server
 * should not contact: malformed URLs, mints outside the optional server
 * allowlist, and hosts that are (or resolve to) loopback, private or
 * link-local addresses. Call this before handing a URL to cashu-ts.
 *
 * Known gaps shared with `/api/cashu/validate-mint`: the check resolves DNS
 * once and cashu-ts resolves again when it connects, and cashu-ts follows
 * redirects.
 */
export async function resolveSafeMintUrl(
  rawMintUrl: unknown
): Promise<SafeMintUrlResult> {
  const mintUrl = normalizeMintUrl(rawMintUrl);
  if (!mintUrl) return { ok: false, error: "Invalid mint URL" };

  if (!isMintAllowedByServerConfig(mintUrl)) {
    return { ok: false, error: "Mint is not allowed" };
  }

  let hostname: string;
  try {
    hostname = new URL(mintUrl).hostname;
  } catch {
    return { ok: false, error: "Invalid mint URL" };
  }

  if (
    !isLocalMintValidationAllowed() &&
    !(await isSafePublicHostname(hostname))
  ) {
    return { ok: false, error: "Mint host is not allowed" };
  }

  return { ok: true, mintUrl };
}
