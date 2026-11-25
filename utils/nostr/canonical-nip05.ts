// SOURCE OF TRUTH — copied into packages/shopstr-mcp/src/generated/ at build time. Do not duplicate this logic elsewhere.
import { lookup } from "node:dns/promises";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";

export const NIP05_REQUEST_TIMEOUT_MS = 10000;
export const MAX_NIP05_RESPONSE_BYTES = 64 * 1024;
export const NIP05_USER_AGENT = "Shopstr-NIP05-Verifier/1.0";

const NIP05_LOCAL_PART_PATTERN = /^[a-z0-9._-]+$/;
const DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const BLOCKED_HOSTNAMES = new Set(["localhost"]);
const BLOCKED_SUFFIXES = [
  ".internal",
  ".local",
  ".localhost",
  ".localdomain",
  ".home.arpa",
];

interface NostrJsonResponse {
  names?: Record<string, string>;
}

export interface ResolvedPublicAddress {
  address: string;
  family: 4 | 6;
}

export type Nip05Verification = {
  attempted: boolean;
  verified: boolean;
  claimed: string;
  checkedAt: string;
  error?: string;
};

export type Nip05VerificationOptions = {
  timeoutMs?: number;
  maxResponseBytes?: number;
  now?: () => Date;
  resolveHostname?: (hostname: string) => Promise<ResolvedPublicAddress[]>;
  fetchJson?: (
    url: string,
    hostname: string,
    resolvedAddress: ResolvedPublicAddress,
    signal: AbortSignal,
    maxResponseBytes: number
  ) => Promise<NostrJsonResponse | null>;
};

export function parseNip05Identifier(
  nip05: string
): { hostname: string; url: string; username: string } | null {
  if (!nip05) return null;

  const parts = nip05.split("@");
  if (parts.length !== 2) return null;

  const [username, domain] = parts;
  if (!username || !domain) return null;
  if (!NIP05_LOCAL_PART_PATTERN.test(username)) return null;

  const normalizedDomain = domain.trim().toLowerCase();
  if (
    !normalizedDomain ||
    !DOMAIN_PATTERN.test(normalizedDomain) ||
    isIP(normalizedDomain) !== 0 ||
    BLOCKED_HOSTNAMES.has(normalizedDomain) ||
    BLOCKED_SUFFIXES.some((suffix) => normalizedDomain.endsWith(suffix))
  ) {
    return null;
  }

  const url = new URL(`https://${normalizedDomain}/.well-known/nostr.json`);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hostname !== normalizedDomain
  ) {
    return null;
  }

  url.searchParams.set("name", username);

  return {
    hostname: normalizedDomain,
    url: url.toString(),
    username,
  };
}

export function isPrivateOrLocalIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet))) {
      return true;
    }

    const first = octets[0] ?? -1;
    const second = octets[1] ?? -1;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }

  if (version === 6) {
    const normalizedAddress = address.toLowerCase();
    const ipv4MappedPrefix = "::ffff:";
    if (normalizedAddress.startsWith(ipv4MappedPrefix)) {
      return isPrivateOrLocalIp(
        normalizedAddress.slice(ipv4MappedPrefix.length)
      );
    }

    return (
      normalizedAddress === "::" ||
      normalizedAddress === "::1" ||
      normalizedAddress.startsWith("fc") ||
      normalizedAddress.startsWith("fd") ||
      /^fe[89ab]/.test(normalizedAddress)
    );
  }

  return true;
}

export async function resolvePublicAddresses(
  hostname: string
): Promise<ResolvedPublicAddress[]> {
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    const publicAddresses = addresses.filter(
      (record): record is ResolvedPublicAddress =>
        (record.family === 4 || record.family === 6) &&
        !isPrivateOrLocalIp(record.address)
    );

    return publicAddresses.length === addresses.length ? publicAddresses : [];
  } catch {
    return [];
  }
}

export function isNip05Match(
  payload: NostrJsonResponse,
  username: string,
  pubkey: string
): boolean {
  if (!payload || typeof payload !== "object") return false;

  const names = payload.names ?? {};
  const claimedPubkey = names[username];
  return (
    typeof claimedPubkey === "string" &&
    claimedPubkey.toLowerCase() === pubkey.toLowerCase()
  );
}

function getContentLength(response: IncomingMessage): number | null {
  const header = response.headers["content-length"];
  const value = Array.isArray(header) ? header[0] : header;

  if (!value) return null;

  const contentLength = Number(value);
  return Number.isFinite(contentLength) && contentLength >= 0
    ? contentLength
    : null;
}

async function readLimitedJson(
  response: IncomingMessage,
  maxResponseBytes: number
): Promise<NostrJsonResponse | null> {
  const contentLength = getContentLength(response);
  if (contentLength !== null && contentLength > maxResponseBytes) {
    response.resume();
    return null;
  }

  return new Promise((resolve, reject) => {
    let body = "";
    let bytesRead = 0;
    let settled = false;

    const finish = (payload: NostrJsonResponse | null) => {
      if (!settled) {
        settled = true;
        resolve(payload);
      }
    };

    response.on("data", (chunk: Buffer | string) => {
      if (settled) return;

      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesRead += buffer.length;

      if (bytesRead > maxResponseBytes) {
        response.destroy();
        finish(null);
        return;
      }

      body += buffer.toString("utf8");
    });

    response.on("end", () => {
      if (settled) return;

      try {
        const parsed = JSON.parse(body);
        finish(parsed && typeof parsed === "object" ? parsed : null);
      } catch {
        finish(null);
      }
    });

    response.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

export async function fetchPinnedNostrJson(
  url: string,
  hostname: string,
  resolvedAddress: ResolvedPublicAddress,
  signal: AbortSignal,
  maxResponseBytes = MAX_NIP05_RESPONSE_BYTES
): Promise<NostrJsonResponse | null> {
  const targetUrl = new URL(url);

  return new Promise((resolve, reject) => {
    const pinnedLookup: LookupFunction = (
      _lookupHostname,
      lookupOptions,
      callback
    ) => {
      if ((lookupOptions as { all?: boolean }).all) {
        (
          callback as (
            error: NodeJS.ErrnoException | null,
            addresses: ResolvedPublicAddress[]
          ) => void
        )(null, [resolvedAddress]);
        return;
      }

      (
        callback as unknown as (
          error: NodeJS.ErrnoException | null,
          address: string,
          family: number
        ) => void
      )(null, resolvedAddress.address, resolvedAddress.family);
    };

    const req = httpsRequest(
      {
        protocol: "https:",
        hostname,
        servername: hostname,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method: "GET",
        headers: {
          Accept: "application/json",
          Host: hostname,
          "User-Agent": NIP05_USER_AGENT,
        },
        signal,
        lookup: pinnedLookup,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        if (statusCode >= 300 && statusCode < 400) {
          response.resume();
          resolve(null);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          resolve(null);
          return;
        }

        readLimitedJson(response, maxResponseBytes).then(resolve, reject);
      }
    );

    req.on("error", reject);
    req.end();
  });
}

export async function verifyNip05Claim(
  claimed: string,
  pubkey: string,
  options: Nip05VerificationOptions = {}
): Promise<Nip05Verification> {
  const checkedAt = (options.now ?? (() => new Date()))().toISOString();
  const normalizedClaim = claimed.trim();
  const normalizedPubkey = pubkey.trim();
  const base = {
    claimed: normalizedClaim,
    checkedAt,
  };

  const parsedIdentifier = parseNip05Identifier(normalizedClaim);
  if (!parsedIdentifier || !normalizedPubkey) {
    return {
      ...base,
      attempted: false,
      verified: false,
      error: "invalid_nip05",
    };
  }

  const controller = new AbortController();
  let didTimeout = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
      const error = new Error("NIP-05 verification timed out");
      error.name = "AbortError";
      reject(error);
    }, options.timeoutMs ?? NIP05_REQUEST_TIMEOUT_MS);
  });

  try {
    const resolver = options.resolveHostname ?? resolvePublicAddresses;
    const publicAddresses = await Promise.race([
      resolver(parsedIdentifier.hostname),
      timeout,
    ]);
    if (!publicAddresses.length) {
      return {
        ...base,
        attempted: true,
        verified: false,
        error: "no_public_addresses",
      };
    }

    const fetchJson = options.fetchJson ?? fetchPinnedNostrJson;
    const data = await Promise.race([
      fetchJson(
        parsedIdentifier.url,
        parsedIdentifier.hostname,
        publicAddresses[0]!,
        controller.signal,
        options.maxResponseBytes ?? MAX_NIP05_RESPONSE_BYTES
      ),
      timeout,
    ]);

    if (!data) {
      return {
        ...base,
        attempted: true,
        verified: false,
        error: "nostr_json_unavailable",
      };
    }

    const matched = isNip05Match(
      data,
      parsedIdentifier.username,
      normalizedPubkey
    );
    return {
      ...base,
      attempted: true,
      verified: matched,
      ...(matched ? {} : { error: "pubkey_mismatch" }),
    };
  } catch (error) {
    return {
      ...base,
      attempted: true,
      verified: false,
      error:
        didTimeout || (error as Error).name === "AbortError"
          ? "timeout"
          : "fetch_failed",
    };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    controller.abort();
  }
}
