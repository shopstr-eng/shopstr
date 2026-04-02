import type { NextApiRequest, NextApiResponse } from "next";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  initializeApiKeysTable,
  ApiKeyPermission,
} from "@/utils/mcp/auth";
import { veFrifyNostrAuth } from "@/utils/stripe/verify-nostr-auth";
import {
  buildApiKeyCreateProof,
  buildApiKeyRevokeProof,
  buildApiKeysListProof,
  McpRequestProof,
  normalizeApiKeysPermission,
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

async function requireSignedEvent(
  req: NextApiRequest,
  res: NextApiResponse,
  proof: McpRequestProof
): Promise<boolean> {
  const signedEvent = extractSignedEventFromRequest(req);
  const result = await verifyAndConsumeSignedRequestProof(signedEvent, proof);

  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return false;
  }

  return true;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await ensureTables();

  if (req.method === "POST") {
    const { name, permissions, pubkey } = req.body || {};
    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedPubkey = typeof pubkey === "string" ? pubkey.trim() : "";

    if (!normalizedName || !normalizedPubkey) {
      return res
        .status(400)
        .json({ error: "Missing required fields: name, pubkey" });
    }

    if (
      permissions !== undefined &&
      permissions !== "read" &&
      permissions !== "read_write"
    ) {
      return res.status(400).json({
        error:
          'Invalid permissions. Supported values are "read" and "read_write".',
      });
    }

    const perm: ApiKeyPermission = normalizeApiKeysPermission(
      typeof permissions === "string" ? permissions : undefined
    );

    if (
      !(await requireSignedEvent(
        req,
        res,
        buildApiKeyCreateProof({
          name: normalizedName,
          permissions: perm,
          pubkey: normalizedPubkey,
        })
      ))
    ) {
      return;
    }

    try {
      const result = await createApiKey(normalizedName, normalizedPubkey, perm);
      return res.status(201).json({
        success: true,
        key: result.key,
        id: result.record.id,
        name: result.record.name,
        permissions: result.record.permissions,
        prefix: result.record.key_prefix,
        message: "Store this key securely. It will not be shown again.",
      });
    } catch (error) {
      console.error("Failed to create API key:", error);
      return res.status(500).json({ error: "Failed to create API key" });
    }
  }

  if (req.method === "GET") {
    const { pubkey } = req.query;
    if (!pubkey || typeof pubkey !== "string" || !pubkey.trim()) {
      return res.status(400).json({ error: "Missing pubkey parameter" });
    }

    const normalizedPubkey = pubkey.trim();

    if (
      !(await requireSignedEvent(
        req,
        res,
        buildApiKeysListProof(normalizedPubkey)
      ))
    ) {
      return;
    }

    try {
      const keys = await listApiKeys(normalizedPubkey);
      return res.status(200).json({ keys });
    } catch (error) {
      console.error("Failed to list API keys:", error);
      return res.status(500).json({ error: "Failed to list API keys" });
    }
  }

  if (req.method === "DELETE") {
    const { id, pubkey } = req.body || {};
    const normalizedPubkey = typeof pubkey === "string" ? pubkey.trim() : "";
    const normalizedId =
      typeof id === "number"
        ? id
        : typeof id === "string" && /^\d+$/.test(id)
          ? Number(id)
          : NaN;

    if (!Number.isInteger(normalizedId) || !normalizedPubkey) {
      return res
        .status(400)
        .json({ error: "Missing required fields: id, pubkey" });
    }

    if (
      !(await requireSignedEvent(
        req,
        res,
        buildApiKeyRevokeProof({
          id: normalizedId,
          pubkey: normalizedPubkey,
        })
      ))
    ) {
      return;
    }

    try {
      const revoked = await revokeApiKey(normalizedId, normalizedPubkey);
      if (!revoked) {
        return res.status(404).json({ error: "API key not found" });
      }
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Failed to revoke API key:", error);
      return res.status(500).json({ error: "Failed to revoke API key" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
