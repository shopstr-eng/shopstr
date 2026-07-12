import type { NextApiRequest, NextApiResponse } from "next";
import { createHash, timingSafeEqual } from "crypto";
import { applyRateLimit } from "@/utils/rate-limit";
import { extractBearerToken } from "@/utils/mcp/auth";
import {
  createPartialRedemption,
  EscrowArbiterSigPayload,
} from "@/utils/cashu/dispute-redemption";
import { sendServerGiftWrappedDm } from "@/utils/nostr/server-gift-wrap";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

type RuleSuccess = { success: true };
type RuleError = { error: string };

type RuleBody = {
  orderId: string;
  token: string;
  rulingFor: "buyer" | "seller";
  winnerNostrPubkey: string;
};

function isRuleBody(body: unknown): body is RuleBody {
  if (typeof body !== "object" || body === null) return false;
  const candidate = body as Partial<RuleBody>;
  return (
    typeof candidate.orderId === "string" &&
    candidate.orderId.length > 0 &&
    typeof candidate.token === "string" &&
    candidate.token.length > 0 &&
    (candidate.rulingFor === "buyer" || candidate.rulingFor === "seller") &&
    typeof candidate.winnerNostrPubkey === "string" &&
    candidate.winnerNostrPubkey.length > 0
  );
}

// Constant-time compare via fixed-length digests, avoiding the
// length-mismatch throw timingSafeEqual raises on unequal-length buffers.
function constantTimeEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RuleSuccess | RuleError>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "arbiter-rule", RATE_LIMIT)) return;

  const expectedSecret = process.env.ARBITER_API_SECRET;
  const providedToken = extractBearerToken(req);
  if (
    !expectedSecret ||
    !providedToken ||
    !constantTimeEqual(providedToken, expectedSecret)
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isRuleBody(req.body)) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  const { orderId, token, winnerNostrPubkey } = req.body;

  const arbiterCashuPrivkey = process.env.ARBITER_PRIVKEY;
  const arbiterNostrPrivkey = process.env.ARBITER_NOSTR_PRIVKEY;
  if (!arbiterCashuPrivkey || !arbiterNostrPrivkey) {
    return res.status(500).json({ error: "Arbiter is not configured" });
  }

  try {
    const { proofs, partialSigs: arbiterSigs } = await createPartialRedemption(
      token,
      arbiterCashuPrivkey
    );

    const payload: EscrowArbiterSigPayload = {
      type: "escrow-arbiter-sig",
      orderId,
      proofs,
      arbiterSigs,
    };

    await sendServerGiftWrappedDm({
      senderPrivkeyHexOrNsec: arbiterNostrPrivkey,
      recipientPubkey: winnerNostrPubkey,
      payload,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Ruling failed",
    });
  }
}
