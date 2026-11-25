import type { NextApiRequest, NextApiResponse } from "next";
import { fetchAllProfilesFromDb } from "@/utils/db/db-service";
import {
  PROFILE_CACHE_PUBKEY_LIMIT,
  type ProfileCacheScope,
} from "@/utils/nostr/profile-cache";
import { isHexPubkey } from "@/utils/nostr/pubkey";
import { applyRateLimit } from "@/utils/rate-limit";

// The unfiltered request still returns the full profile set.
const RATE_LIMIT = { limit: 300, windowMs: 60 * 1000 };

function parseScope({
  kind,
  pubkeys,
}: NextApiRequest["query"]): ProfileCacheScope | null | undefined {
  if (kind === undefined && pubkeys === undefined) return undefined;
  if ((kind !== "0" && kind !== "30019") || typeof pubkeys !== "string") {
    return null;
  }

  const authors = pubkeys.split(",");
  if (
    authors.length > PROFILE_CACHE_PUBKEY_LIMIT ||
    !authors.every(isHexPubkey)
  ) {
    return null;
  }

  return {
    kind: kind === "0" ? 0 : 30019,
    pubkeys: [...new Set(authors)],
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "fetch-profiles", RATE_LIMIT)) return;

  const scope = parseScope(req.query);
  if (scope === null) {
    return res.status(400).json({ error: "Invalid profile scope" });
  }

  try {
    const profiles = scope
      ? await fetchAllProfilesFromDb(scope)
      : await fetchAllProfilesFromDb();
    res.status(200).json(profiles);
  } catch (error) {
    console.error("Failed to fetch profiles from database:", error);
    res.status(500).json({ error: "Failed to fetch profiles" });
  }
}
