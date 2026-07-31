import {
  Mint as CashuMint,
  Wallet as CashuWallet,
  Proof,
  getTokenMetadata,
  signP2PKProof,
} from "@cashu/cashu-ts";
import { verifyEvent } from "nostr-tools";
import { publishProofEvent } from "@/utils/nostr/nostr-helper-functions";
import { NostrEvent, NostrManager } from "@/utils/nostr/nostr-manager";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import {
  buildMessagesListProof,
  buildSignedHttpRequestProofTemplate,
  SIGNED_EVENT_HEADER,
} from "@/utils/nostr/request-auth";

export type EscrowPaymentRequestPayload = {
  type: "escrow-payment-request";
  orderId: string;
};

export type EscrowBuyerSigPayload = {
  type: "escrow-buyer-sig";
  orderId: string;
  proofs: Proof[];
  buyerSigs: string[];
};

export type EscrowArbiterSigPayload = {
  type: "escrow-arbiter-sig";
  orderId: string;
  proofs: Proof[];
  arbiterSigs: string[];
};

export type EscrowDisputePayload = {
  type: "escrow-dispute";
  orderId: string;
  reason: string;
  // Populated only in the copy DMed to the arbiter, who has no other way
  // to read the buyer's self-encrypted kind 30406 escrow record.
  token?: string;
  amount?: number;
};

export type EscrowPayload =
  | EscrowPaymentRequestPayload
  | EscrowBuyerSigPayload
  | EscrowArbiterSigPayload
  | EscrowDisputePayload;

type FindIncomingEscrowPayloadOptions = {
  expectedSenderPubkeys?: string[];
};

// Decodes a Cashu token and signs each proof's P2PK secret with privkey,
// producing exactly one signature per proof toward the 2-of-3 threshold.
// Returns the original, undecorated proofs (never the signed copies) so the
// caller can combine this signature with a counterparty's in
// combineAndRedeem without any pre-existing witness state getting in the way.
export async function createPartialRedemption(
  token: string,
  privkey: string
): Promise<{ proofs: Proof[]; partialSigs: string[] }> {
  const tokenMetadata = getTokenMetadata(token);
  const wallet = new CashuWallet(new CashuMint(tokenMetadata.mint), {
    unit: tokenMetadata.unit,
  });
  await wallet.loadMint();
  const decodedToken = wallet.decodeToken(token);
  const proofs = decodedToken.proofs;

  const partialSigs: string[] = [];
  for (const proof of proofs) {
    const signedProof = signP2PKProof(proof, privkey);
    const witness =
      typeof signedProof.witness === "string"
        ? JSON.parse(signedProof.witness)
        : signedProof.witness;
    const signatures: string[] = witness?.signatures ?? [];
    if (signatures.length === 0) {
      throw new Error("Failed to produce a P2PK signature for a proof.");
    }
    partialSigs.push(signatures[signatures.length - 1]!);
  }

  return { proofs, partialSigs };
}

// Combines two independently-produced signature sets (e.g. buyer + seller,
// or a party + the arbiter) into each proof's witness and submits the
// result to the mint. Neither caller ever holds both privkeys — only their
// own signature plus the counterparty's signature string received over a
// NIP-59 DM — so this is the only place the 2-of-3 witness is assembled.
// Never throws: the mint's acceptance/rejection is the only thing allowed
// to flip the caller's UI state to "claimed," so failures are returned, not
// thrown.
export async function combineAndRedeem(params: {
  proofs: Proof[];
  sig1: string[];
  sig2: string[];
  tokenMint: string;
  tokenAmount: number;
  nostr: NostrManager;
  signer: NostrSigner;
  mints: string[];
  tokens: Proof[];
  history: any[];
}): Promise<{ success: boolean; error?: string }> {
  const {
    proofs,
    sig1,
    sig2,
    tokenMint,
    tokenAmount,
    nostr,
    signer,
    mints,
    tokens,
    history,
  } = params;

  if (proofs.length !== sig1.length || proofs.length !== sig2.length) {
    return { success: false, error: "Signature count mismatch." };
  }

  try {
    const proofsWithWitness: Proof[] = proofs.map((proof, i) => ({
      ...proof,
      witness: JSON.stringify({ signatures: [sig1[i], sig2[i]] }),
    }));

    const wallet = new CashuWallet(new CashuMint(tokenMint));
    await wallet.loadMint();
    // No privkey argument: cashu-ts only re-signs when a privkey is passed,
    // so this forwards proofsWithWitness (2-of-3 witness intact) straight
    // to the mint's swap endpoint, which is the actual authority that
    // validates the threshold.
    const freshProofs = await wallet.receive(proofsWithWitness);

    const uniqueProofs = freshProofs.filter(
      (proof: Proof) => !tokens.some((t: Proof) => t.C === proof.C)
    );
    localStorage.setItem(
      "tokens",
      JSON.stringify([...tokens, ...uniqueProofs])
    );
    if (!mints.includes(tokenMint)) {
      localStorage.setItem("mints", JSON.stringify([...mints, tokenMint]));
    }
    localStorage.setItem(
      "history",
      JSON.stringify([
        {
          type: 1,
          amount: tokenAmount,
          date: Math.floor(Date.now() / 1000),
        },
        ...history,
      ])
    );

    await publishProofEvent(
      nostr,
      signer,
      tokenMint,
      freshProofs,
      "in",
      tokenAmount.toString()
    );

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Reads the current user's incoming NIP-59 gift-wraps looking for a
// specific escrow control-plane payload addressed to them for a given
// order. Self-contained (does not reuse fetchGiftWrappedChatsAndMessages,
// which filters by a fixed chat "subject" allowlist that doesn't include
// these escrow subjects and is coupled to chat-thread UI state).
export async function findIncomingEscrowPayload<T extends EscrowPayload>(
  nostr: NostrManager,
  signer: NostrSigner,
  userPubkey: string,
  orderId: string,
  type: T["type"],
  options: FindIncomingEscrowPayloadOptions = {}
): Promise<T | null> {
  const relayEvents = await nostr.fetch([
    { kinds: [1059], "#p": [userPubkey] },
  ]);
  const relayPayload = await findEscrowPayloadInEvents(
    relayEvents,
    signer,
    userPubkey,
    orderId,
    type,
    options
  );
  if (relayPayload) return relayPayload;

  const cachedEvents = await fetchCachedGiftWrapEvents(userPubkey, signer);
  return findEscrowPayloadInEvents(
    cachedEvents,
    signer,
    userPubkey,
    orderId,
    type,
    options
  );
}

async function fetchCachedGiftWrapEvents(
  userPubkey: string,
  signer: NostrSigner
): Promise<NostrEvent[]> {
  try {
    const signedEvent = await signer.sign(
      buildSignedHttpRequestProofTemplate(buildMessagesListProof(userPubkey))
    );
    const response = await fetch(
      `/api/db/fetch-messages?pubkey=${encodeURIComponent(userPubkey)}`,
      {
        headers: {
          [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
        },
      }
    );
    if (!response.ok) return [];

    const events = (await response.json()) as unknown;
    if (!Array.isArray(events)) return [];
    return events.filter(
      (event): event is NostrEvent =>
        Boolean(event) &&
        typeof event === "object" &&
        (event as { kind?: unknown }).kind === 1059
    );
  } catch {
    return [];
  }
}

async function findEscrowPayloadInEvents<T extends EscrowPayload>(
  events: NostrEvent[],
  signer: NostrSigner,
  userPubkey: string,
  orderId: string,
  type: T["type"],
  options: FindIncomingEscrowPayloadOptions
): Promise<T | null> {
  const expectedSenderPubkeys = new Set(
    (options.expectedSenderPubkeys ?? []).filter(Boolean)
  );
  const sortedEvents = [...events].sort(
    (a, b) => (b.created_at ?? 0) - (a.created_at ?? 0)
  );

  for (const event of sortedEvents) {
    try {
      if (event.kind !== 1059 || !verifyEvent(event as any)) continue;
      if (!event.tags.some((tag) => tag[0] === "p" && tag[1] === userPubkey)) {
        continue;
      }

      const sealJson = await signer.decrypt(event.pubkey, event.content);
      const sealEvent = JSON.parse(sealJson);
      if (sealEvent.kind !== 13) continue;
      if (!Array.isArray(sealEvent.tags) || sealEvent.tags.length !== 0) {
        continue;
      }
      if (!verifyEvent(sealEvent)) continue;
      if (
        expectedSenderPubkeys.size > 0 &&
        !expectedSenderPubkeys.has(sealEvent.pubkey)
      ) {
        continue;
      }

      const rumorJson = await signer.decrypt(
        sealEvent.pubkey,
        sealEvent.content
      );
      const rumor = JSON.parse(rumorJson);
      if (rumor.pubkey !== sealEvent.pubkey) continue;

      const payload = JSON.parse(rumor.content);
      if (payload?.type === type && payload?.orderId === orderId) {
        return payload as T;
      }
    } catch {
      continue;
    }
  }

  return null;
}
