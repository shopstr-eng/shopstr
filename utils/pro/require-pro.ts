// Server-side Pro entitlement gate for API routes. Use on every Pro-only
// write/use so enforcement lives on the server, not just in the UI.
//
// `isPubkeyProEntitled` returns true only for the entitled statuses
// (trialing/active/grace). Free, read-only (lapsed <1mo) and hidden
// (lapsed >1mo) sellers are all "not entitled", so this single check
// correctly blocks writes for read-only sellers too (they may VIEW their
// Pro content but never save changes).

import type { NextApiResponse } from "next";
import { isPubkeyProEntitled } from "@/utils/pro/membership";

export const PRO_REQUIRED_MESSAGE =
  "This feature requires an active Pro membership.";

/**
 * Reject the request with 403 + a clear message unless `pubkey` is currently
 * Pro-entitled. Returns true when entitled (caller proceeds), false when it
 * has already written the 403 response (caller must return).
 */
export async function requireProEntitlement(
  pubkey: string,
  res: NextApiResponse
): Promise<boolean> {
  let entitled = false;
  try {
    entitled = await isPubkeyProEntitled(pubkey);
  } catch (error) {
    console.error("requireProEntitlement: failed to resolve membership", error);
    res
      .status(503)
      .json({ error: "Could not verify membership. Please try again." });
    return false;
  }
  if (!entitled) {
    res.status(403).json({ error: PRO_REQUIRED_MESSAGE });
    return false;
  }
  return true;
}
