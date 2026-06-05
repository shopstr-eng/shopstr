import type { NextApiRequest, NextApiResponse } from "next";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  createApiKey,
  initializeApiKeysTable,
  ApiKeyPermission,
} from "@/utils/mcp/auth";
import { encryptNsec } from "@/utils/mcp/nostr-signing";
import { checkOnboardRateLimit } from "@/utils/mcp/metrics";
import {
  buildOnboardExistingPubkeyProof,
  normalizeOnboardPermission,
} from "@/utils/mcp/request-proof";
import {
  extractSignedEventFromRequest,
  verifyAndConsumeSignedRequestProof,
} from "@/utils/mcp/request-proof-server";
import { getRequestIp } from "@/utils/rate-limit";

let tablesReady = false;
const MCP_STREAMABLE_HTTP_ACCEPT = "application/json, text/event-stream";
const SAFE_HTTP_PROTOCOLS = new Set(["http", "https"]);

async function ensureTables() {
  if (!tablesReady) {
    await initializeApiKeysTable();
    tablesReady = true;
  }
}

function getFirstHeaderValue(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }

  return value?.split(",")[0]?.trim() || undefined;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function normalizeHostValue(host: string): string {
  const trimmedHost = host.trim().toLowerCase();
  if (
    trimmedHost.length === 0 ||
    /[\s/@?#\\]/.test(trimmedHost) ||
    trimmedHost.includes("/")
  ) {
    throw new Error(`Invalid host: ${host}`);
  }

  return new URL(`http://${trimmedHost}`).host.toLowerCase();
}

function parseConfiguredBaseUrl(): string | undefined {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (!configuredBaseUrl) return undefined;

  const parsedBaseUrl = new URL(configuredBaseUrl);
  const protocol = parsedBaseUrl.protocol.replace(":", "");
  if (!SAFE_HTTP_PROTOCOLS.has(protocol)) {
    throw new Error("NEXT_PUBLIC_BASE_URL must use http or https");
  }

  return normalizeBaseUrl(parsedBaseUrl.toString());
}

function parseAllowedHosts(): Set<string> {
  const allowedHosts = new Set<string>();
  const rawAllowedHosts = process.env.MCP_ALLOWED_HOSTS?.split(",") || [];

  for (const host of rawAllowedHosts) {
    const trimmedHost = host.trim();
    if (trimmedHost.length === 0) continue;
    allowedHosts.add(normalizeHostValue(trimmedHost));
  }

  return allowedHosts;
}

function isAllowlistedHost(host: string, allowedHosts: Set<string>): boolean {
  const candidateUrl = new URL(`http://${host}`);

  return Array.from(allowedHosts).some((allowedHost) => {
    const allowedUrl = new URL(`http://${allowedHost}`);

    if (allowedUrl.port) {
      return allowedUrl.host === candidateUrl.host;
    }

    return (
      allowedUrl.hostname.toLowerCase() === candidateUrl.hostname.toLowerCase()
    );
  });
}

function isPrivateIpv4Address(hostname: string): boolean {
  const octets = hostname.split(".").map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [firstOctet = -1, secondOctet = -1] = octets;

  return (
    firstOctet === 0 ||
    firstOctet === 10 ||
    firstOctet === 127 ||
    (firstOctet === 192 && secondOctet === 168) ||
    (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31)
  );
}

function isDevelopmentHost(host: string): boolean {
  const hostname = new URL(`http://${host}`).hostname.toLowerCase();

  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    isPrivateIpv4Address(hostname)
  );
}

function resolveRequestProtocol(
  req: Pick<NextApiRequest, "headers" | "socket">
): "http" | "https" {
  const forwardedProto = getFirstHeaderValue(
    req.headers["x-forwarded-proto"]
  )?.toLowerCase();
  if (forwardedProto && SAFE_HTTP_PROTOCOLS.has(forwardedProto)) {
    return forwardedProto as "http" | "https";
  }

  return (req.socket as typeof req.socket & { encrypted?: boolean }).encrypted
    ? "https"
    : "http";
}

function escapeForSingleQuotedShell(value: string): string {
  return value.replace(/'/g, `'\"'\"'`);
}

function stringifyCurlPayload(payload: Record<string, unknown>): string {
  return escapeForSingleQuotedShell(JSON.stringify(payload));
}

function resolveBaseUrl(
  req: Pick<NextApiRequest, "headers" | "socket">
): string {
  const configuredBaseUrl = parseConfiguredBaseUrl();
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const requestHostHeader = getFirstHeaderValue(req.headers.host);
  const requestHost = requestHostHeader
    ? normalizeHostValue(requestHostHeader)
    : undefined;
  const forwardedHostHeader = getFirstHeaderValue(
    req.headers["x-forwarded-host"]
  );
  const forwardedHost = forwardedHostHeader
    ? normalizeHostValue(forwardedHostHeader)
    : undefined;
  const allowedHosts = parseAllowedHosts();
  const isProduction = process.env.NODE_ENV === "production";
  const candidateHosts = [forwardedHost, requestHost].filter(
    (host, index, allHosts): host is string =>
      typeof host === "string" && allHosts.indexOf(host) === index
  );
  const selectedHost = candidateHosts.find((host) => {
    if (isAllowlistedHost(host, allowedHosts)) {
      return true;
    }

    return !isProduction && (host === requestHost || isDevelopmentHost(host));
  });

  if (!selectedHost) {
    throw new Error(
      "Unable to resolve a safe public MCP base URL. Set NEXT_PUBLIC_BASE_URL or allowlist hosts with MCP_ALLOWED_HOSTS."
    );
  }

  return `${resolveRequestProtocol(req)}://${selectedHost}`;
}

function buildQuickStartExamples(
  baseUrl: string,
  apiKey: string,
  agentName: string
) {
  const initializePayload = stringifyCurlPayload({
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: agentName,
        version: "1.0.0",
      },
    },
    id: 1,
  });
  const listToolsPayload = stringifyCurlPayload({
    jsonrpc: "2.0",
    method: "tools/list",
    id: 2,
  });
  const searchProductsPayload = stringifyCurlPayload({
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "search_products",
      arguments: {},
    },
    id: 3,
  });

  return {
    curl_initialize: `curl -i -X POST ${baseUrl}/api/mcp \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Accept: ${MCP_STREAMABLE_HTTP_ACCEPT}" \\
  -H "Content-Type: application/json" \\
  -d '${initializePayload}'`,
    curl_list_tools: `curl -X POST ${baseUrl}/api/mcp \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Accept: ${MCP_STREAMABLE_HTTP_ACCEPT}" \\
  -H "Content-Type: application/json" \\
  -H "Mcp-Session-Id: <session-id-from-initialize>" \\
  -d '${listToolsPayload}'`,
    curl_search: `curl -X POST ${baseUrl}/api/mcp \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Accept: ${MCP_STREAMABLE_HTTP_ACCEPT}" \\
  -H "Content-Type: application/json" \\
  -H "Mcp-Session-Id: <session-id-from-initialize>" \\
  -d '${searchProductsPayload}'`,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const ip = getRequestIp(req);

  if (!checkOnboardRateLimit(ip)) {
    return res.status(429).json({
      error: "Rate limit exceeded. Maximum 10 onboarding requests per hour.",
    });
  }

  const {
    name,
    permissions,
    contact,
    pubkey: providedPubkey,
    nsec: providedNsec,
  } = req.body || {};

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({
      error: "Missing required field: name",
      usage: {
        method: "POST",
        body: {
          name: "(required) string - Name for this agent/integration",
          permissions:
            '(optional) "read" | "read_write" | "full_access" - defaults to "read"',
          contact: "(optional) string - Contact email or URL for this agent",
          pubkey:
            "(optional) string - Existing Nostr pubkey (hex or npub1...). If omitted, a new keypair is generated.",
          nsec: "(optional) string - Nostr secret key (nsec1... or hex). Required for full_access with an existing pubkey. Stored encrypted.",
        },
      },
    });
  }

  let resolvedPubkey: string | null = null;
  if (providedPubkey && typeof providedPubkey === "string") {
    const trimmed = providedPubkey.trim();
    if (trimmed.startsWith("npub1")) {
      try {
        const decoded = nip19.decode(trimmed);
        if (decoded.type !== "npub") {
          return res.status(400).json({
            error:
              "Invalid npub. Expected an npub1... bech32-encoded public key.",
          });
        }
        resolvedPubkey = decoded.data as string;
      } catch {
        return res
          .status(400)
          .json({ error: "Invalid npub. Could not decode bech32 public key." });
      }
    } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      resolvedPubkey = trimmed.toLowerCase();
    } else {
      return res.status(400).json({
        error:
          "Invalid pubkey format. Provide a 64-char hex string or an npub1... bech32 key.",
      });
    }
  }

  const trimmedName = name.trim();
  const trimmedContact =
    typeof contact === "string" && contact.trim().length > 0
      ? contact.trim()
      : undefined;

  const perm: ApiKeyPermission = normalizeOnboardPermission(
    typeof permissions === "string" ? permissions : undefined
  );

  try {
    await ensureTables();

    const usingExistingKey = !!resolvedPubkey;
    let pubkey: string;
    let skHex: string | null = null;
    let encryptedNsecValue: string | undefined;

    if (resolvedPubkey) {
      pubkey = resolvedPubkey;

      if (providedNsec && typeof providedNsec === "string") {
        const trimmedNsec = providedNsec.trim();
        try {
          let nsecPubkey: string;
          if (trimmedNsec.startsWith("nsec1")) {
            const decoded = nip19.decode(trimmedNsec);
            if (decoded.type !== "nsec") {
              return res.status(400).json({ error: "Invalid nsec format." });
            }
            nsecPubkey = getPublicKey(decoded.data as Uint8Array);
          } else if (/^[0-9a-f]{64}$/i.test(trimmedNsec)) {
            nsecPubkey = getPublicKey(hexToBytes(trimmedNsec));
          } else {
            return res.status(400).json({
              error:
                "Invalid nsec format. Provide an nsec1... bech32 key or 64-char hex private key.",
            });
          }

          if (nsecPubkey !== pubkey) {
            return res.status(400).json({
              error: "The provided nsec does not match the provided pubkey.",
            });
          }

          encryptedNsecValue = encryptNsec(trimmedNsec);
        } catch (e: any) {
          return res.status(400).json({
            error: `Invalid nsec: ${
              e.message || "Could not decode secret key."
            }`,
          });
        }
      } else {
        if (perm === "full_access") {
          return res.status(400).json({
            error:
              "A matching nsec is required when onboarding an existing pubkey with full_access permissions.",
          });
        }

        const proofResult = await verifyAndConsumeSignedRequestProof(
          extractSignedEventFromRequest(req),
          buildOnboardExistingPubkeyProof({
            name: trimmedName,
            permissions: perm,
            contact: trimmedContact,
            pubkey,
          })
        );

        if (!proofResult.ok) {
          return res.status(proofResult.status).json({
            error: proofResult.error,
          });
        }
      }
    } else {
      const sk = generateSecretKey();
      pubkey = getPublicKey(sk);
      skHex = bytesToHex(sk);

      const nsecStr = nip19.nsecEncode(sk);
      encryptedNsecValue = encryptNsec(nsecStr);
    }

    const agentName = trimmedContact
      ? `${trimmedName} (${trimmedContact})`
      : trimmedName;

    const result = await createApiKey(
      agentName,
      pubkey,
      perm,
      encryptedNsecValue
    );

    const baseUrl = resolveBaseUrl(req);

    const npub = nip19.npubEncode(pubkey);

    const responseBody: Record<string, unknown> = {
      apiKey: result.key,
      pubkey,
      npub,
      permissions: perm,
      mcpEndpoint: `${baseUrl}/api/mcp`,
      manifestUrl: `${baseUrl}/.well-known/agent.json`,
      quickStart: {
        description:
          "Use the API key as a Bearer token to authenticate MCP requests.",
        examples: buildQuickStartExamples(baseUrl, result.key, trimmedName),
        notes: [
          "Store your API key securely — it will not be shown again.",
          "Run the initialize command with -i so curl prints the Mcp-Session-Id response header for follow-up requests.",
          `Your permissions are set to "${perm}".${
            perm === "read"
              ? ' Upgrade to "read_write" to place orders, or "full_access" for full marketplace participation.'
              : perm === "read_write"
                ? ' Upgrade to "full_access" for full marketplace participation (listings, profiles, etc).'
                : ""
          }`,
        ],
      },
    };

    if (!usingExistingKey && skHex) {
      const nsec = nip19.nsecEncode(hexToBytes(skHex));
      responseBody.nsec = nsec;
      (responseBody.quickStart as Record<string, unknown>).notes = [
        ...((responseBody.quickStart as Record<string, unknown>)
          .notes as string[]),
        "The nsec (Nostr secret key) is provided for advanced Nostr integrations. Store it securely.",
        "Your nsec has been securely stored (encrypted) for server-side signing capabilities.",
      ];
    } else {
      responseBody.existingIdentity = true;
      if (encryptedNsecValue) {
        (responseBody.quickStart as Record<string, unknown>).notes = [
          ...((responseBody.quickStart as Record<string, unknown>)
            .notes as string[]),
          "Your nsec has been securely stored (encrypted) for server-side signing capabilities.",
        ];
      } else {
        (responseBody.quickStart as Record<string, unknown>).notes = [
          ...((responseBody.quickStart as Record<string, unknown>)
            .notes as string[]),
          "To enable write capabilities (listings, profiles, etc), set your nsec via POST /api/mcp/set-nsec.",
        ];
      }
    }

    return res.status(201).json(responseBody);
  } catch (error) {
    console.error("Onboarding failed:", error);
    return res.status(500).json({
      error: "Onboarding failed. Please try again later.",
    });
  }
}
