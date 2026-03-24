import type { NextApiRequest, NextApiResponse } from "next";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  initializeApiKeysTable,
  ApiKeyPermission,
} from "@/utils/mcp/auth";
import { verifyNostrAuth } from "@/utils/stripe/verify-nostr-auth";

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
  await ensureTables();

  if (req.method === "POST") {
    const { name, permissions, signedEvent, pubkey } = req.body;

    if (!name || !pubkey) {
      return res
        .status(400)
        .json({ error: "Missing required fields: name, pubkey" });
    }

    if (signedEvent) {
      const authResult = verifyNostrAuth(signedEvent, pubkey);
      if (!authResult.valid) {
        return res.status(401).json({ error: authResult.error });
      }
    }

    const perm: ApiKeyPermission =
      permissions === "read_write" ? "read_write" : "read";

    try {
      const result = await createApiKey(name, pubkey, perm);
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
    if (!pubkey || typeof pubkey !== "string") {
      return res.status(400).json({ error: "Missing pubkey parameter" });
    }

    try {
      const keys = await listApiKeys(pubkey);
      return res.status(200).json({ keys });
    } catch (error) {
      console.error("Failed to list API keys:", error);
      return res.status(500).json({ error: "Failed to list API keys" });
    }
  }

  if (req.method === "DELETE") {
    const { id, pubkey, signedEvent } = req.body;

    if (!id || !pubkey) {
      return res
        .status(400)
        .json({ error: "Missing required fields: id, pubkey" });
    }

    if (signedEvent) {
      const authResult = verifyNostrAuth(signedEvent, pubkey);
      if (!authResult.valid) {
        return res.status(401).json({ error: authResult.error });
      }
    }

    try {
      const revoked = await revokeApiKey(id, pubkey);
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
