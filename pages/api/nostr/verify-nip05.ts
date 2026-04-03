import type { NextApiRequest, NextApiResponse } from "next";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const REQUEST_TIMEOUT_MS = 10000;
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
      return isPrivateIpAddress(normalizedAddress.slice(ipv4MappedPrefix.length));
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

async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return (
      addresses.length > 0 &&
      addresses.every(({ address }) => !isPrivateIpAddress(address))
    );
  } catch {
    return false;
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

  if (!(await resolvesToPublicAddress(parsedIdentifier.hostname))) {
    return res.status(200).json({ verified: false });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(parsedIdentifier.url, {
      headers: {
        Accept: "application/json",
      },
      redirect: "manual",
      signal: controller.signal,
    });

    if (
      (response.status >= 300 && response.status < 400) ||
      !response.ok
    ) {
      return res.status(200).json({ verified: false });
    }

    const data = (await response.json()) as NostrJsonResponse;
    return res.status(200).json({
      verified: isNip05Match(data, parsedIdentifier.username, pubkey),
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
