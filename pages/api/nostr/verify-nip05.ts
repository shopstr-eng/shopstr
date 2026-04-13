import type { NextApiRequest, NextApiResponse } from "next";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";

const REQUEST_TIMEOUT_MS = 10000;
const MAX_NIP05_RESPONSE_BYTES = 64 * 1024;
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

interface VerifyNip05Response {
  verified: boolean;
}

interface ResolvedPublicAddress {
  address: string;
  family: 4 | 6;
}

function parseNip05Identifier(
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

function isPrivateIpAddress(address: string): boolean {
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
      return isPrivateIpAddress(
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

async function resolvePublicAddresses(
  hostname: string
): Promise<ResolvedPublicAddress[]> {
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    const publicAddresses = addresses.filter(
      (record): record is ResolvedPublicAddress =>
        (record.family === 4 || record.family === 6) &&
        !isPrivateIpAddress(record.address)
    );

    return publicAddresses.length === addresses.length ? publicAddresses : [];
  } catch {
    return [];
  }
}

function isNip05Match(
  payload: NostrJsonResponse,
  username: string,
  pubkey: string
): boolean {
  if (!payload || typeof payload !== "object") return false;

  const names = payload.names ?? {};
  return names[username] === pubkey || names[username.toLowerCase()] === pubkey;
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
  response: IncomingMessage
): Promise<NostrJsonResponse | null> {
  const contentLength = getContentLength(response);
  if (contentLength !== null && contentLength > MAX_NIP05_RESPONSE_BYTES) {
    response.resume();
    return null;
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
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

      if (bytesRead > MAX_NIP05_RESPONSE_BYTES) {
        response.destroy();
        finish(null);
        return;
      }

      chunks.push(buffer);
    });

    response.on("end", () => {
      if (settled) return;

      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
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

async function fetchPinnedNostrJson(
  url: string,
  hostname: string,
  resolvedAddress: ResolvedPublicAddress,
  signal: AbortSignal
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

        readLimitedJson(response).then(resolve, reject);
      }
    );

    req.on("error", reject);
    req.end();
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VerifyNip05Response | { error: string }>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const nip05 =
    typeof req.query.nip05 === "string" ? req.query.nip05.trim() : "";
  const pubkey =
    typeof req.query.pubkey === "string" ? req.query.pubkey.trim() : "";

  if (!nip05 || !pubkey) {
    return res.status(400).json({ error: "nip05 and pubkey are required" });
  }

  const parsedIdentifier = parseNip05Identifier(nip05);
  if (!parsedIdentifier) {
    return res.status(400).json({ error: "Invalid NIP-05 identifier" });
  }

  const publicAddresses = await resolvePublicAddresses(
    parsedIdentifier.hostname
  );
  if (!publicAddresses.length) {
    return res.status(200).json({ verified: false });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const data = await fetchPinnedNostrJson(
      parsedIdentifier.url,
      parsedIdentifier.hostname,
      publicAddresses[0]!,
      controller.signal
    );

    return res.status(200).json({
      verified: data
        ? isNip05Match(data, parsedIdentifier.username, pubkey)
        : false,
    });
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      console.error("NIP-05 verification fetch failed:", error);
    }
    return res.status(200).json({ verified: false });
  } finally {
    clearTimeout(timeoutId);
  }
}
