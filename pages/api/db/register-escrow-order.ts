import type { NextApiRequest, NextApiResponse } from "next";
import { getDecodedToken, type Proof } from "@cashu/cashu-ts";
import { applyRateLimit } from "@/utils/rate-limit";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import { registerP2pkEscrowOrder } from "@/utils/db/db-service";
import { hashEscrowToken } from "@/utils/cashu/escrow-order-commitment";
import { sumProofAmounts } from "@/utils/cashu/proof-amount";
import {
  getArbiterPubkey,
  normalizeCashuPubkey,
  parseP2PKProofSet,
  pubkeysEqual,
} from "@/utils/cashu/p2pk-checkout";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };
const HEX_32_BYTE = /^[0-9a-f]{64}$/;
const ORDER_ID = /^[\x21-\x7e]{1,128}$/;

// Registration is token-bound: every commitment field (orderId, lock keys,
// amount, locktime, token hash) is derived server-side from the escrow token
// itself. A client cannot register an orderId with attacker-chosen pubkeys,
// because the orderId comes out of the token's P2PK secret — which only the
// buyer possesses at registration time (checkout registers before the token
// is disclosed to the seller). This closes orderId squatting, where a seller
// who saw an invoice's orderId could pre-register it and permanently disable
// dispute resolution for that order. The token is safe to submit: it is
// locked 2-of-3, so this server cannot spend it alone, and the arbiter
// receives the same token at ruling time anyway.
// sellerNostrPubkey remains a client claim (it is not in the token) and is
// only used to DM the ruling winner; it cannot influence who can redeem.
type EscrowOrderRegistrationBody = {
  token: string;
  sellerNostrPubkey: string;
  buyerCashuPubkey: string;
};

type DerivedCommitment = {
  orderId: string;
  invoiceOrderId: string;
  sellerCashuPubkey: string;
  buyerCashuPubkey: string;
  arbiterCashuPubkey: string;
  amountSats: number;
  locktime: number;
  tokenHash: string;
};

function isRegistrationBody(
  body: unknown
): body is EscrowOrderRegistrationBody {
  if (typeof body !== "object" || body === null) return false;
  const value = body as Partial<EscrowOrderRegistrationBody>;
  return (
    typeof value.token === "string" &&
    value.token.length > 0 &&
    typeof value.sellerNostrPubkey === "string" &&
    HEX_32_BYTE.test(value.sellerNostrPubkey) &&
    typeof value.buyerCashuPubkey === "string" &&
    HEX_32_BYTE.test(value.buyerCashuPubkey)
  );
}

function decodeTokenProofs(token: string): Proof[] | null {
  try {
    const decodedToken = getDecodedToken(token, []);
    return Array.isArray(decodedToken?.proofs) ? decodedToken.proofs : null;
  } catch {
    return null;
  }
}

type CommitmentDerivation =
  | { ok: true; commitment: DerivedCommitment }
  | { ok: false; status: 400 | 500; error: string };

function deriveCommitmentFromToken(
  body: EscrowOrderRegistrationBody
): CommitmentDerivation {
  const proofs = decodeTokenProofs(body.token);
  if (!proofs || proofs.length === 0) {
    return { ok: false, status: 400, error: "Invalid escrow token" };
  }

  let amountSats: number;
  try {
    amountSats = sumProofAmounts(proofs);
  } catch {
    return { ok: false, status: 400, error: "Invalid escrow token amount" };
  }
  if (!Number.isSafeInteger(amountSats) || amountSats <= 0) {
    return { ok: false, status: 400, error: "Invalid escrow token amount" };
  }

  const parsedProofSet = parseP2PKProofSet(proofs);
  if (!parsedProofSet.p2pk) {
    return {
      ok: false,
      status: 400,
      error:
        parsedProofSet.invalidReason ??
        "Escrow token is not locked with P2PK escrow",
    };
  }
  const { p2pk } = parsedProofSet;

  const escrowPubkeys = [p2pk.pubkey, ...(p2pk.pubkeys ?? [])];
  const uniqueEscrowPubkeys = new Set(
    escrowPubkeys
      .map((pubkey) => normalizeCashuPubkey(pubkey))
      .filter((pubkey): pubkey is string => Boolean(pubkey))
  );
  if (p2pk.nSigs !== 2 || uniqueEscrowPubkeys.size !== 3) {
    return {
      ok: false,
      status: 400,
      error: "Escrow token is not locked as 2-of-3 escrow",
    };
  }

  const invoiceOrderId = p2pk.shopstrOrderId;
  if (!invoiceOrderId || !ORDER_ID.test(invoiceOrderId)) {
    return {
      ok: false,
      status: 400,
      error: "Escrow token is not bound to a valid order",
    };
  }

  if (!Number.isSafeInteger(p2pk.locktime) || p2pk.locktime <= 0) {
    return {
      ok: false,
      status: 400,
      error: "Escrow token has no valid locktime",
    };
  }

  const configuredArbiterPubkey = getArbiterPubkey();
  if (!configuredArbiterPubkey) {
    return {
      ok: false,
      status: 500,
      error: "Arbiter Cashu pubkey is not configured",
    };
  }

  const normalizedKeys = Array.from(uniqueEscrowPubkeys);
  if (
    !normalizedKeys.some((pubkey) =>
      pubkeysEqual(pubkey, configuredArbiterPubkey)
    )
  ) {
    return {
      ok: false,
      status: 400,
      error: "Escrow token is not locked to the configured arbiter",
    };
  }

  const buyerCashuPubkey = normalizeCashuPubkey(body.buyerCashuPubkey);
  if (
    !buyerCashuPubkey ||
    pubkeysEqual(buyerCashuPubkey, configuredArbiterPubkey) ||
    !normalizedKeys.some((pubkey) => pubkeysEqual(pubkey, buyerCashuPubkey))
  ) {
    return {
      ok: false,
      status: 400,
      error: "Buyer Cashu pubkey is not part of the escrow lock",
    };
  }

  const sellerCashuPubkey = normalizedKeys.find(
    (pubkey) =>
      !pubkeysEqual(pubkey, configuredArbiterPubkey) &&
      !pubkeysEqual(pubkey, buyerCashuPubkey)
  );
  if (!sellerCashuPubkey) {
    return {
      ok: false,
      status: 400,
      error: "Escrow token lock keys are inconsistent",
    };
  }

  // The record is keyed by H(token), not the invoice order id. A squatter
  // who knows an invoice's order id cannot predict the real token's hash,
  // and minting a counterfeit token with the same shopstr_order tag lands on
  // a different key — so first-write-wins no longer protects an attacker.
  const tokenHash = hashEscrowToken(body.token);
  return {
    ok: true,
    commitment: {
      orderId: tokenHash,
      invoiceOrderId,
      sellerCashuPubkey,
      buyerCashuPubkey,
      arbiterCashuPubkey: configuredArbiterPubkey,
      amountSats,
      locktime: p2pk.locktime,
      tokenHash,
    },
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "register-escrow-order", RATE_LIMIT)) return;

  const auth = await verifyNip98Request(req, "POST");
  if (!auth.ok) {
    return res.status(401).json({ error: auth.error });
  }
  if (!isRegistrationBody(req.body)) {
    return res.status(400).json({ error: "Invalid escrow order commitment" });
  }

  const derivation = deriveCommitmentFromToken(req.body);
  if (!derivation.ok) {
    return res.status(derivation.status).json({ error: derivation.error });
  }

  try {
    const result = await registerP2pkEscrowOrder({
      ...derivation.commitment,
      sellerNostrPubkey: req.body.sellerNostrPubkey,
      buyerNostrPubkey: auth.pubkey,
    });
    if (result === "conflict") {
      return res.status(409).json({
        error: "Escrow order is already registered with different details",
      });
    }
    return res.status(result === "created" ? 201 : 200).json({ success: true });
  } catch (error) {
    console.error("Failed to register escrow order:", error);
    return res.status(500).json({ error: "Failed to register escrow order" });
  }
}
