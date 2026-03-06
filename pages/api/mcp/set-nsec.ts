import type { NextApiRequest, NextApiResponse } from "next";
import { getPublicKey, nip19 } from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils";
import {
  authenticateRequest,
  updateApiKeyNsec,
  ApiKeyPermission,
} from "@/utils/mcp/auth";
import { encryptNsec } from "@/utils/mcp/nostr-signing";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const apiKey = await authenticateRequest(req, res);
  if (!apiKey) return;

  const { nsec, permissions } = req.body || {};

  if (!nsec || typeof nsec !== "string") {
    return res.status(400).json({
      error: "Missing required field: nsec",
      usage: {
        method: "POST",
        headers: { Authorization: "Bearer <your-api-key>" },
        body: {
          nsec: "(required) string - Nostr secret key (nsec1... or 64-char hex)",
          permissions:
            '(optional) "full_access" - Upgrade permissions when setting nsec',
        },
      },
    });
  }

  const trimmedNsec = nsec.trim();
  let derivedPubkey: string;

  try {
    if (trimmedNsec.startsWith("nsec1")) {
      const decoded = nip19.decode(trimmedNsec);
      if (decoded.type !== "nsec") {
        return res.status(400).json({ error: "Invalid nsec format." });
      }
      derivedPubkey = getPublicKey(decoded.data as Uint8Array);
    } else if (/^[0-9a-f]{64}$/i.test(trimmedNsec)) {
      derivedPubkey = getPublicKey(hexToBytes(trimmedNsec));
    } else {
      return res.status(400).json({
        error:
          "Invalid nsec format. Provide an nsec1... bech32 key or 64-char hex private key.",
      });
    }
  } catch {
    return res
      .status(400)
      .json({ error: "Invalid nsec. Could not decode secret key." });
  }

  if (derivedPubkey !== apiKey.pubkey) {
    return res.status(400).json({
      error:
        "The provided nsec does not match the pubkey associated with this API key.",
    });
  }

  let newPermissions: ApiKeyPermission | undefined;
  if (permissions === "full_access") {
    newPermissions = "full_access";
  }

  try {
    const encryptedNsecValue = encryptNsec(trimmedNsec);
    const updated = await updateApiKeyNsec(
      apiKey.id,
      apiKey.pubkey,
      encryptedNsecValue,
      newPermissions
    );

    if (!updated) {
      return res.status(500).json({ error: "Failed to update nsec." });
    }

    return res.status(200).json({
      success: true,
      pubkey: apiKey.pubkey,
      permissions: newPermissions || apiKey.permissions,
      message:
        "Nsec securely stored. Server-side signing is now enabled for this API key.",
    });
  } catch (error) {
    console.error("Failed to set nsec:", error);
    return res
      .status(500)
      .json({ error: "Failed to store nsec. Please try again later." });
  }
}
