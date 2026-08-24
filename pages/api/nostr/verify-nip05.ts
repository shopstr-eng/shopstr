import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { verifyNip05Claim } from "@/utils/nostr/canonical-nip05";

const RATE_LIMIT = { limit: 120, windowMs: 60 * 1000 };

interface VerifyNip05Response {
  verified: boolean;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VerifyNip05Response | { error: string }>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "verify-nip05", RATE_LIMIT)) return;

  const nip05 =
    typeof req.query.nip05 === "string" ? req.query.nip05.trim() : "";
  const pubkey =
    typeof req.query.pubkey === "string" ? req.query.pubkey.trim() : "";

  if (!nip05 || !pubkey) {
    return res.status(400).json({ error: "nip05 and pubkey are required" });
  }

  const verification = await verifyNip05Claim(nip05, pubkey);
  if (!verification.attempted && verification.error === "invalid_nip05") {
    return res.status(400).json({ error: "Invalid NIP-05 identifier" });
  }

  if (
    verification.error === "fetch_failed" ||
    verification.error === "nostr_json_unavailable"
  ) {
    console.error(
      "NIP-05 verification fetch failed:",
      new Error(verification.error)
    );
  }

  return res.status(200).json({ verified: verification.verified });
}
