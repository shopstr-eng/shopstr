import type { NextApiRequest, NextApiResponse } from "next";
import { getTokenMetadata } from "@cashu/cashu-ts";
import { applyRateLimit } from "@/utils/rate-limit";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import {
  createPartialRedemption,
  EscrowArbiterSigPayload,
} from "@/utils/cashu/dispute-redemption";
import {
  isP2pkMintAllowed,
  isP2pkMintAllowlistConfigured,
} from "@/utils/cashu/p2pk-checkout";
import { sendServerGiftWrappedDm } from "@/utils/nostr/server-gift-wrap";
import {
  createDisputeEventTemplate,
  fetchDisputeEventCandidates,
  parseDisputeEvent,
  selectAuthoritativeDisputeEvent,
} from "@/utils/nostr/dispute-records";
import { fetchCachedDisputeEvents } from "@/utils/nostr/server-dispute-records";
import { getOrderParticipants } from "@/utils/db/db-service";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { getDefaultRelays, withBlastr } from "@/utils/nostr/relay-config";
import { McpNostrSigner, signAndPublishEvent } from "@/utils/mcp/nostr-signing";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

type RuleSuccess = { success: true };
type RuleError = { error: string };

type RuleBody = {
  orderId: string;
  token: string;
  rulingFor: "buyer" | "seller";
};

function isRuleBody(body: unknown): body is RuleBody {
  if (typeof body !== "object" || body === null) return false;
  const candidate = body as Partial<RuleBody>;
  return (
    typeof candidate.orderId === "string" &&
    candidate.orderId.length > 0 &&
    typeof candidate.token === "string" &&
    candidate.token.length > 0 &&
    (candidate.rulingFor === "buyer" || candidate.rulingFor === "seller")
  );
}

function getConfiguredArbiterPubkey(): string | undefined {
  return (
    process.env.ARBITER_NOSTR_PUBKEY ||
    process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY
  );
}

function createServerNostrManager(): NostrManager {
  return new NostrManager(withBlastr(getDefaultRelays()), {
    connectionTimeout: 10_000,
    keepAliveTime: 60_000,
    gcInterval: 60_000,
  });
}

function getTokenMint(token: string): string | null {
  try {
    return getTokenMetadata(token).mint;
  } catch {
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RuleSuccess | RuleError>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "arbiter-rule", RATE_LIMIT)) return;

  const expectedArbiterPubkey = getConfiguredArbiterPubkey();
  if (!expectedArbiterPubkey) {
    return res.status(500).json({ error: "Arbiter pubkey is not configured" });
  }

  const auth = await verifyNip98Request(req, "POST");
  if (!auth.ok) {
    return res.status(401).json({ error: auth.error });
  }
  if (auth.pubkey !== expectedArbiterPubkey) {
    return res.status(403).json({ error: "Only the arbiter can rule" });
  }

  if (!isRuleBody(req.body)) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  const { orderId, token, rulingFor } = req.body;

  const tokenMint = getTokenMint(token);
  if (
    !tokenMint ||
    !isP2pkMintAllowlistConfigured() ||
    !isP2pkMintAllowed(tokenMint)
  ) {
    return res
      .status(400)
      .json({ error: "Token mint is not allowed for dispute escrow" });
  }

  const arbiterCashuPrivkey = process.env.ARBITER_PRIVKEY;
  const arbiterNostrPrivkey = process.env.ARBITER_NOSTR_PRIVKEY;
  if (!arbiterCashuPrivkey || !arbiterNostrPrivkey) {
    return res.status(500).json({ error: "Arbiter is not configured" });
  }

  try {
    const arbiterSigner = new McpNostrSigner(arbiterNostrPrivkey);
    if (arbiterSigner.getPubKey() !== expectedArbiterPubkey) {
      return res.status(500).json({
        error: "Arbiter Nostr private key does not match configured pubkey",
      });
    }

    let candidates = await fetchCachedDisputeEvents(orderId);
    if (candidates.length === 0) {
      const nostr = createServerNostrManager();
      try {
        candidates = await fetchDisputeEventCandidates({
          nostr,
          orderId,
          timeoutMs: 10_000,
        });
      } finally {
        nostr.close();
      }
    }

    if (candidates.length === 0) {
      return res.status(404).json({ error: "Dispute not found" });
    }

    // Cross-check candidates against the order's authoritative buyer/seller
    // pubkeys (independent of anything in the dispute events' own tags,
    // which an attacker fully controls for events they sign themselves)
    // before trusting any of them for payout.
    const orderParticipants = await getOrderParticipants(orderId);
    const disputeEvent = selectAuthoritativeDisputeEvent(
      candidates,
      orderParticipants
    );
    if (!disputeEvent) {
      return res
        .status(403)
        .json({ error: "Dispute event does not match order records" });
    }

    const dispute = parseDisputeEvent(disputeEvent);
    if (!dispute) {
      return res.status(400).json({ error: "Invalid dispute event" });
    }
    if (dispute.arbiterPubkey !== expectedArbiterPubkey) {
      return res
        .status(403)
        .json({ error: "Dispute is assigned to a different arbiter" });
    }
    if (dispute.status !== "open") {
      return res.status(409).json({ error: "Dispute is not open" });
    }

    const winnerNostrPubkey =
      rulingFor === "buyer" ? dispute.buyerPubkey : dispute.sellerPubkey;

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
      waitForRelayPublish: false,
    });

    await signAndPublishEvent(
      arbiterSigner,
      createDisputeEventTemplate({
        orderId,
        reason: dispute.reason,
        buyerPubkey: dispute.buyerPubkey,
        sellerPubkey: dispute.sellerPubkey,
        arbiterPubkey: dispute.arbiterPubkey,
        status: `resolved:${rulingFor}`,
      }),
      undefined,
      { waitForRelayPublish: false }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Arbiter ruling failed:", error);
    return res.status(500).json({ error: "Ruling failed" });
  }
}
