import type { NextApiRequest, NextApiResponse } from "next";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
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

let tablesReady = false;

async function ensureTables() {
  if (!tablesReady) {
    await initializeApiKeysTable();
    tablesReady = true;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

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

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.host}`;

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
        examples: {
          curl_initialize: `curl -X POST ${baseUrl}/api/mcp \\
  -H "Authorization: Bearer ${result.key}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"${trimmedName}","version":"1.0.0"}},"id":1}'`,
          curl_list_tools: `curl -X POST ${baseUrl}/api/mcp \\
  -H "Authorization: Bearer ${result.key}" \\
  -H "Content-Type: application/json" \\
  -H "Mcp-Session-Id: <session-id-from-initialize>" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'`,
          curl_search_products: `curl -X POST ${baseUrl}/api/mcp \\
  -H "Authorization: Bearer ${result.key}" \\
  -H "Content-Type: application/json" \\
  -H "Mcp-Session-Id: <session-id-from-initialize>" \\
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_products","arguments":{"query":"milk"}},"id":3}'`,
        },
        notes: [
          "Store your API key securely — it will not be shown again.",
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
