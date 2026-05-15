import type { NextApiRequest, NextApiResponse } from "next";
import { verifyNostrAuth } from "@/utils/stripe/verify-nostr-auth";

export function getAdminPubkeys(): string[] {
  const raw = process.env.ADMIN_PUBKEYS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminPubkey(pubkey: string): boolean {
  if (!pubkey) return false;
  return getAdminPubkeys().includes(pubkey.toLowerCase());
}

/**
 * Verifies that the request carries a signed Nostr auth event from a pubkey
 * listed in ADMIN_PUBKEYS. Responds with 401/403 and returns null on failure.
 */
export function requireAdmin(
  req: NextApiRequest,
  res: NextApiResponse,
  action: string,
  binding?: { method: string; path: string; fields?: Record<string, string> }
): { pubkey: string } | null {
  const signedEvent = req.body?.signedEvent ?? null;
  if (!signedEvent) {
    res.status(401).json({ error: "signedEvent is required" });
    return null;
  }
  const result = verifyNostrAuth(
    signedEvent,
    undefined,
    action as any,
    binding as any
  );
  if (!result.valid) {
    res.status(401).json({ error: result.error || "Invalid auth" });
    return null;
  }
  if (!isAdminPubkey(result.pubkey)) {
    res.status(403).json({ error: "Not an admin" });
    return null;
  }
  return { pubkey: result.pubkey };
}
