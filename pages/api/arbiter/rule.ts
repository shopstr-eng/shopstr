import type { NextApiRequest, NextApiResponse } from "next";
import { getDecodedToken, getTokenMetadata, type Proof } from "@cashu/cashu-ts";
import { applyRateLimit } from "@/utils/rate-limit";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import {
  createPartialRedemption,
  EscrowArbiterSigPayload,
} from "@/utils/cashu/dispute-redemption";
import {
  getArbiterPubkey,
  isP2pkMintAllowed,
  isP2pkMintAllowlistConfigured,
  parseP2PKProofSet,
  pubkeysEqual,
} from "@/utils/cashu/p2pk-checkout";
import { hashEscrowToken } from "@/utils/cashu/escrow-order-commitment";
import { deriveCashuPubkey } from "@/utils/cashu/wallet-config";
import { sumProofAmounts } from "@/utils/cashu/proof-amount";
import { sendServerGiftWrappedDm } from "@/utils/nostr/server-gift-wrap";
import {
  createDisputeEventTemplate,
  fetchDisputeEventCandidates,
  parseDisputeEvent,
  selectAuthoritativeDisputeEvent,
} from "@/utils/nostr/dispute-records";
import { fetchCachedDisputeEvents } from "@/utils/nostr/server-dispute-records";
import {
  getP2pkEscrowOrder,
  recordP2pkEscrowRuling,
  type P2pkEscrowOrderRecord,
} from "@/utils/db/db-service";
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

type DisputeTokenValidation =
  { ok: true } | { ok: false; status: 400 | 403 | 500; error: string };

function decodeTokenProofs(token: string): Proof[] | null {
  try {
    const decodedToken = getDecodedToken(token, []);
    return Array.isArray(decodedToken?.proofs) ? decodedToken.proofs : null;
  } catch {
    return null;
  }
}

function getProofAmountSats(proofs: Proof[]): number | null {
  try {
    const amount = sumProofAmounts(proofs);
    if (!Number.isFinite(amount) || amount < 0) return null;
    return amount;
  } catch {
    return null;
  }
}

function validateDisputeToken(params: {
  orderId: string;
  token: string;
  orderRecord: P2pkEscrowOrderRecord;
}): DisputeTokenValidation {
  const { orderId, token, orderRecord } = params;

  const configuredArbiterCashuPubkey = getArbiterPubkey();
  if (!configuredArbiterCashuPubkey) {
    return {
      ok: false,
      status: 500,
      error: "Arbiter Cashu pubkey is not configured",
    };
  }
  if (
    !pubkeysEqual(configuredArbiterCashuPubkey, orderRecord.arbiterCashuPubkey)
  ) {
    return {
      ok: false,
      status: 403,
      error: "Escrow order is assigned to a different Cashu arbiter",
    };
  }
  if (hashEscrowToken(token) !== orderRecord.tokenHash) {
    return {
      ok: false,
      status: 400,
      error: "Dispute token does not match the registered order token",
    };
  }

  const proofs = decodeTokenProofs(token);
  if (!proofs || proofs.length === 0) {
    return { ok: false, status: 400, error: "Invalid dispute token" };
  }

  const tokenAmountSats = getProofAmountSats(proofs);
  if (tokenAmountSats === null) {
    return { ok: false, status: 400, error: "Invalid dispute token amount" };
  }

  if (tokenAmountSats !== orderRecord.amountSats) {
    return {
      ok: false,
      status: 400,
      error: "Dispute token amount does not match the order amount",
    };
  }

  const parsedProofSet = parseP2PKProofSet(proofs);
  if (!parsedProofSet.p2pk) {
    return {
      ok: false,
      status: 400,
      error:
        parsedProofSet.invalidReason ??
        "Dispute token is not locked with P2PK escrow",
    };
  }

  const escrowPubkeys = [
    parsedProofSet.p2pk.pubkey,
    ...(parsedProofSet.p2pk.pubkeys ?? []),
  ];
  const uniqueEscrowPubkeys = new Set(
    escrowPubkeys
      .map((pubkey) => {
        const normalized =
          pubkey.length === 66 ? pubkey.slice(2).toLowerCase() : pubkey;
        return normalized.toLowerCase();
      })
      .filter(Boolean)
  );
  if (parsedProofSet.p2pk.nSigs !== 2 || uniqueEscrowPubkeys.size !== 3) {
    return {
      ok: false,
      status: 400,
      error: "Dispute token is not locked as 2-of-3 escrow",
    };
  }

  if (parsedProofSet.p2pk.shopstrOrderId !== orderId) {
    return {
      ok: false,
      status: 400,
      error: "Dispute token is not bound to the disputed order",
    };
  }

  const expectedEscrowPubkeys = [
    orderRecord.sellerCashuPubkey,
    orderRecord.buyerCashuPubkey,
    orderRecord.arbiterCashuPubkey,
  ];
  if (
    expectedEscrowPubkeys.some(
      (expected) =>
        !escrowPubkeys.some((actual) => pubkeysEqual(actual, expected))
    )
  ) {
    return {
      ok: false,
      status: 400,
      error: "Dispute token lock keys do not match the registered order",
    };
  }
  if (parsedProofSet.p2pk.locktime !== orderRecord.locktime) {
    return {
      ok: false,
      status: 400,
      error: "Dispute token locktime does not match the registered order",
    };
  }

  return { ok: true };
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
  const configuredArbiterCashuPubkey = getArbiterPubkey();
  const derivedArbiterCashuPubkey = deriveCashuPubkey(arbiterCashuPrivkey);
  if (
    !configuredArbiterCashuPubkey ||
    !derivedArbiterCashuPubkey ||
    !pubkeysEqual(derivedArbiterCashuPubkey, configuredArbiterCashuPubkey)
  ) {
    return res.status(500).json({
      error: "Arbiter Cashu private key does not match configured pubkey",
    });
  }

  try {
    const arbiterSigner = new McpNostrSigner(arbiterNostrPrivkey);
    if (arbiterSigner.getPubKey() !== expectedArbiterPubkey) {
      return res.status(500).json({
        error: "Arbiter Nostr private key does not match configured pubkey",
      });
    }

    const orderRecord = await getP2pkEscrowOrder(orderId);
    if (!orderRecord) {
      return res
        .status(403)
        .json({ error: "Escrow order record is unavailable" });
    }
    if (orderRecord.rulingFor && orderRecord.rulingFor !== rulingFor) {
      return res
        .status(409)
        .json({ error: "Dispute already has a final ruling" });
    }

    const cachedCandidates = await fetchCachedDisputeEvents(orderId);
    const nostr = createServerNostrManager();
    let relayCandidates;
    try {
      relayCandidates = await fetchDisputeEventCandidates({
        nostr,
        orderId,
        timeoutMs: 10_000,
      });
    } finally {
      nostr.close();
    }
    const candidates = Array.from(
      new Map(
        [...cachedCandidates, ...relayCandidates].map((event) => [
          event.id,
          event,
        ])
      ).values()
    );

    if (candidates.length === 0) {
      return res.status(404).json({ error: "Dispute not found" });
    }

    // Cross-check candidates against the order's authoritative buyer/seller
    // pubkeys (independent of anything in the dispute events' own tags,
    // which an attacker fully controls for events they sign themselves)
    // before trusting any of them for payout.
    const disputeEvent = selectAuthoritativeDisputeEvent(
      candidates,
      {
        buyerPubkey: orderRecord.buyerNostrPubkey,
        sellerPubkey: orderRecord.sellerNostrPubkey,
      },
      expectedArbiterPubkey
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
    const expectedResolvedStatus = `resolved:${rulingFor}`;
    if (
      dispute.status !== "open" &&
      !(
        orderRecord.rulingFor === rulingFor &&
        dispute.status === expectedResolvedStatus
      )
    ) {
      return res.status(409).json({ error: "Dispute is not open" });
    }

    const tokenValidation = validateDisputeToken({
      orderId,
      token,
      orderRecord,
    });
    if (!tokenValidation.ok) {
      return res
        .status(tokenValidation.status)
        .json({ error: tokenValidation.error });
    }

    const winnerNostrPubkey =
      rulingFor === "buyer"
        ? orderRecord.buyerNostrPubkey
        : orderRecord.sellerNostrPubkey;

    const rulingResult = await recordP2pkEscrowRuling(orderId, rulingFor);
    if (rulingResult === "not-found") {
      return res
        .status(403)
        .json({ error: "Escrow order record is unavailable" });
    }
    if (rulingResult === "conflict") {
      return res
        .status(409)
        .json({ error: "Dispute already has a final ruling" });
    }

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
      { waitForRelayPublish: false, requireDurableCache: true }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Arbiter ruling failed:", error);
    return res.status(500).json({ error: "Ruling failed" });
  }
}
