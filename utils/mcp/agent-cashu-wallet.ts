import {
  Mint as CashuMint,
  Wallet as CashuWallet,
  getTokenMetadata,
  normalizeProofAmounts,
  OutputData,
  type Proof,
  type SerializedBlindedSignature,
  type SerializedOutputData,
} from "@cashu/cashu-ts";
import type { McpNostrSigner } from "@/utils/mcp/nostr-signing";
import { signAndPublishEvent } from "@/utils/mcp/nostr-signing";
import {
  deleteCachedEventsByIds,
  fetchAllWalletEventsFromDb,
} from "@/utils/db/db-service";
import { withMintRetry } from "@/utils/cashu/mint-retry-service";
import { safeMeltProofs } from "@/utils/cashu/melt-retry-service";
import { safeSwap } from "@/utils/cashu/swap-retry-service";
import { resolveSafeMintUrl } from "@/utils/cashu/mint-url-safety";
import { cashuAmountToNumber } from "@/utils/cashu/proof-amount";
import { getDefaultRelays, withBlastr } from "@/utils/nostr/relay-config";

const PROOF_EVENT_KIND = 7375;
const DELETION_EVENT_KIND = 5;
const DEFAULT_PAYMENT_MINT = "https://mint.minibits.cash/Bitcoin";

const MINT_READ_RETRY = {
  maxAttempts: 3,
  perAttemptTimeoutMs: 15000,
  totalTimeoutMs: 45000,
};

/** Failure with a stable, agent-facing title and the detail to show. */
export class AgentWalletError extends Error {
  constructor(
    readonly title: string,
    readonly details: string
  ) {
    super(details);
    this.name = "AgentWalletError";
  }
}

// Proofs as persisted: NIP-60 wants numeric amounts, but cashu-ts 4 serializes
// its Amount type as a string, so everything is converted before it is stored.
type StoredProof = Omit<Proof, "amount"> & { amount: number };

/**
 * Recovery material for a melt whose change has not been persisted yet: the
 * serialized blank outputs the mint signs change against. Lets a later
 * session unblind that change once the quote resolves PAID.
 */
type PendingChange = {
  quote: string;
  keysetId: string;
  /** Secrets of the melt's input proofs — quarantined while unresolved. */
  inputs: string[];
  outputs: SerializedOutputData[];
};

type WalletProofEvent = {
  id: string;
  mint: string;
  proofs: StoredProof[];
  pendingChange?: PendingChange[];
};

function mintKey(mintUrl: string): string {
  return mintUrl.trim().replace(/\/+$/, "");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function toStoredProof(proof: Proof | StoredProof): StoredProof {
  return { ...proof, amount: cashuAmountToNumber(proof.amount) };
}

function sumProofAmounts(proofs: Array<{ amount: unknown }>): number {
  return proofs.reduce((sum, p) => sum + cashuAmountToNumber(p.amount), 0);
}

function parseStoredProofs(value: unknown): StoredProof[] {
  if (!Array.isArray(value)) return [];
  const proofs: StoredProof[] = [];
  for (const entry of value) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.secret !== "string" ||
      typeof entry.C !== "string" ||
      typeof entry.id !== "string"
    ) {
      continue;
    }
    try {
      proofs.push(toStoredProof(entry as Proof));
    } catch {
      // A proof without a usable amount cannot be spent; leave it out.
    }
  }
  return proofs;
}

// One wallet operation at a time per agent. Two overlapping payments would
// pick the same proofs and the second would fail on already-spent inputs.
const walletLocks = new Map<string, Promise<unknown>>();

function withWalletLock<T>(pubkey: string, task: () => Promise<T>): Promise<T> {
  const run = (walletLocks.get(pubkey) ?? Promise.resolve()).then(task);
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  walletLocks.set(pubkey, tail);
  void tail.then(() => {
    if (walletLocks.get(pubkey) === tail) walletLocks.delete(pubkey);
  });
  return run;
}

async function loadProofEvents(
  signer: McpNostrSigner
): Promise<WalletProofEvent[]> {
  const pubkey = signer.getPubKey();
  const events = await fetchAllWalletEventsFromDb(pubkey);
  const proofEvents: WalletProofEvent[] = [];
  // A failed retirement can leave a replaced event behind alongside its
  // successor, holding the same proofs or the same pendingChange entry.
  // Count each proof secret and each recovery quote exactly once.
  const seenSecrets = new Set<string>();
  const seenQuotes = new Set<string>();

  for (const event of events) {
    if (event.kind !== PROOF_EVENT_KIND) continue;
    try {
      const parsed = JSON.parse(signer.decrypt(pubkey, event.content));
      if (typeof parsed?.mint !== "string") continue;
      const proofs = parseStoredProofs(parsed.proofs).filter((proof) => {
        if (seenSecrets.has(proof.secret)) return false;
        seenSecrets.add(proof.secret);
        return true;
      });
      const pendingChange: PendingChange[] = Array.isArray(parsed?.pendingChange)
        ? parsed.pendingChange.filter(
            (entry: unknown): entry is PendingChange => {
              if (
                !entry ||
                typeof entry !== "object" ||
                typeof (entry as PendingChange).quote !== "string" ||
                typeof (entry as PendingChange).keysetId !== "string" ||
                !Array.isArray((entry as PendingChange).inputs) ||
                !Array.isArray((entry as PendingChange).outputs)
              ) {
                return false;
              }
              if (seenQuotes.has((entry as PendingChange).quote)) return false;
              seenQuotes.add((entry as PendingChange).quote);
              return true;
            }
          )
        : [];
      proofEvents.push({
        id: event.id,
        mint: parsed.mint,
        proofs,
        ...(pendingChange.length > 0 ? { pendingChange } : {}),
      });
    } catch {
      continue;
    }
  }

  return proofEvents;
}

async function openWallet(
  mintUrl: string,
  title: string
): Promise<CashuWallet> {
  try {
    const wallet = new CashuWallet(new CashuMint(mintUrl), { unit: "sat" });
    await withMintRetry(() => wallet.loadMint(), MINT_READ_RETRY);
    return wallet;
  } catch (error) {
    throw new AgentWalletError(
      title,
      `Could not reach mint ${mintUrl}: ${errorMessage(error)}`
    );
  }
}

async function requireSafeMint(
  rawMintUrl: string,
  title: string
): Promise<string> {
  const safeMint = await resolveSafeMintUrl(rawMintUrl);
  if (!safeMint.ok) throw new AgentWalletError(title, safeMint.error);
  return safeMint.mintUrl;
}

/**
 * Writes `proofs` as a new kind 7375 event (durably, before returning), then
 * retires the events it replaces. The save always comes first so a failure
 * part way through can leave stale events behind but never lose proofs.
 * Stale events are harmless: loading deduplicates repeated proofs and
 * recovery entries, and the next payment prunes whatever the mint reports
 * as spent.
 */
async function replaceProofEvents(
  signer: McpNostrSigner,
  mint: string,
  proofs: Array<Proof | StoredProof>,
  replaces: string[],
  pendingChange: PendingChange[] = []
): Promise<string | null> {
  let newEventId: string | null = null;

  // An event carrying only unresolved change-recovery data is still written:
  // deleting the events it replaces would otherwise destroy that data.
  if (proofs.length > 0 || pendingChange.length > 0) {
    const pubkey = signer.getPubKey();
    const content = signer.encrypt(
      pubkey,
      JSON.stringify({
        mint,
        unit: "sat",
        proofs: proofs.map(toStoredProof),
        ...(replaces.length > 0 ? { del: replaces } : {}),
        ...(pendingChange.length > 0 ? { pendingChange } : {}),
      })
    );
    const tags: string[][] = [["mint", mint]];
    for (const relay of withBlastr(getDefaultRelays())) {
      tags.push(["relay", relay]);
    }
    const saved = await signAndPublishEvent(
      signer,
      {
        kind: PROOF_EVENT_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content,
      },
      undefined,
      { requireDurableCache: true, waitForRelayPublish: false }
    );
    newEventId = saved.id;
  }

  if (replaces.length > 0) {
    try {
      await signAndPublishEvent(
        signer,
        {
          kind: DELETION_EVENT_KIND,
          created_at: Math.floor(Date.now() / 1000),
          content: "Spent Cashu proofs",
          tags: [
            ...replaces.map((id) => ["e", id]),
            ["k", String(PROOF_EVENT_KIND)],
          ],
        },
        undefined,
        { waitForRelayPublish: false }
      );
    } catch (error) {
      console.warn("Failed to publish Cashu proof deletion:", error);
    }
    try {
      await deleteCachedEventsByIds(replaces);
    } catch (error) {
      // The replacement is already saved; stale remnants are deduplicated
      // on load and pruned once the mint reports them spent.
      console.warn("Failed to delete replaced Cashu proof events:", error);
    }
  }

  return newEventId;
}

/**
 * Recovers change for melts whose post-payment wallet write failed or never
 * completed. Each pendingChange entry carries the melt's serialized blank
 * outputs; once the mint reports the quote PAID, its blinded change
 * signatures are unblinded into spendable proofs. UNPAID means the melt
 * never settled and the staged proofs are still spendable, so the entry is
 * simply retired. PENDING, unreachable mints, and malformed responses leave
 * the entry untouched for the next attempt.
 */
async function reconcilePendingChange(
  signer: McpNostrSigner,
  wallet: CashuWallet,
  mint: string,
  events: WalletProofEvent[]
): Promise<WalletProofEvent[]> {
  const result: WalletProofEvent[] = [];
  // Secrets already held across the wallet: recovered change that is
  // already persisted elsewhere (e.g. a staged event whose retirement
  // failed after its replacement was saved) must not be stored twice.
  const heldSecrets = new Set(
    events.flatMap((event) => event.proofs.map((proof) => proof.secret))
  );
  for (const event of events) {
    const pending = event.pendingChange ?? [];
    if (pending.length === 0) {
      result.push(event);
      continue;
    }

    let proofs = [...event.proofs];
    const stillPending: PendingChange[] = [];
    let resolvedAny = false;
    for (const entry of pending) {
      let quote;
      try {
        quote = await withMintRetry(
          () => wallet.checkMeltQuoteBolt11(entry.quote),
          MINT_READ_RETRY
        );
      } catch {
        stillPending.push(entry);
        continue;
      }
      if (quote.state === "PAID") {
        // PAID means the mint consumed the melt's inputs; drop them so a
        // later payment cannot select already-spent proofs.
        proofs = proofs.filter(
          (proof) => !entry.inputs.includes(proof.secret)
        );
        const blinded =
          (quote as { change?: SerializedBlindedSignature[] }).change ?? [];
        if (blinded.length > 0) {
          try {
            const changeProofs = wallet.createMeltChangeProofs(
              entry.outputs.map((output) => OutputData.deserialize(output)),
              blinded
            );
            const fresh = changeProofs.filter(
              (proof) => !heldSecrets.has(proof.secret)
            );
            for (const proof of fresh) heldSecrets.add(proof.secret);
            proofs = [...proofs, ...fresh.map(toStoredProof)];
          } catch {
            // A malformed change response must not destroy recovery data.
            stillPending.push(entry);
            continue;
          }
        }
        resolvedAny = true;
      } else if (quote.state === "UNPAID") {
        resolvedAny = true;
      } else {
        stillPending.push(entry);
      }
    }

    if (!resolvedAny) {
      result.push(event);
      continue;
    }
    try {
      const newId = await replaceProofEvents(
        signer,
        mint,
        proofs,
        [event.id],
        stillPending
      );
      if (newId) {
        result.push({
          id: newId,
          mint,
          proofs,
          ...(stillPending.length > 0 ? { pendingChange: stillPending } : {}),
        });
      }
      // A null id means nothing remains (no proofs, no pending entries):
      // the event was fully resolved and retired.
    } catch {
      // The rewrite failed; the original event keeps the recovery data.
      result.push(event);
    }
  }
  return result;
}

/**
 * Drops proofs the mint reports as spent, rewriting or retiring the events
 * that held them. This also repairs wallets left holding spent proofs by
 * earlier versions of the payment tool.
 */
async function pruneSpentProofs(
  signer: McpNostrSigner,
  wallet: CashuWallet,
  mint: string,
  events: WalletProofEvent[]
): Promise<WalletProofEvent[]> {
  const proofs = events.flatMap((event) => event.proofs);
  if (proofs.length === 0) return events;

  const states = await withMintRetry(
    () => wallet.checkProofsStates(proofs),
    MINT_READ_RETRY
  );
  const spent = new Set(
    proofs.filter((_, i) => states[i]?.state === "SPENT").map((p) => p.secret)
  );
  if (spent.size === 0) return events;

  // Events carrying unresolved melt-change recovery data are left to
  // reconcilePendingChange: pruning them here could retire the blank
  // outputs while the quote is still pending.
  const hasPending = (e: WalletProofEvent) =>
    !!e.pendingChange && e.pendingChange.length > 0;
  const clean = events.filter(
    (e) => hasPending(e) || e.proofs.every((p) => !spent.has(p.secret))
  );
  const dirty = events.filter(
    (e) => !hasPending(e) && e.proofs.some((p) => spent.has(p.secret))
  );
  const survivors = dirty
    .flatMap((e) => e.proofs)
    .filter((p) => !spent.has(p.secret));

  const newId = await replaceProofEvents(
    signer,
    mint,
    survivors,
    dirty.map((e) => e.id)
  );
  return newId ? [...clean, { id: newId, mint, proofs: survivors }] : clean;
}

export async function getAgentWalletBalance(
  signer: McpNostrSigner,
  mintUrl?: string
) {
  const events = await loadProofEvents(signer);
  const mintBalances: Record<string, number> = {};
  let totalBalance = 0;

  for (const event of events) {
    if (mintUrl && mintKey(event.mint) !== mintKey(mintUrl)) continue;
    const amount = sumProofAmounts(event.proofs);
    totalBalance += amount;
    mintBalances[event.mint] = (mintBalances[event.mint] ?? 0) + amount;
  }

  return { totalBalance, mintBalances, proofEventCount: events.length };
}

export async function receiveAgentCashuToken(
  signer: McpNostrSigner,
  token: string
) {
  const title = "Failed to receive Cashu tokens";

  let metadata: ReturnType<typeof getTokenMetadata>;
  try {
    metadata = getTokenMetadata(token);
  } catch (error) {
    throw new AgentWalletError(title, errorMessage(error));
  }
  if (metadata.unit !== "sat") {
    throw new AgentWalletError(
      title,
      `Only sat tokens are supported, got "${metadata.unit}"`
    );
  }
  const mint = await requireSafeMint(metadata.mint, title);

  return withWalletLock(signer.getPubKey(), async () => {
    const wallet = await openWallet(mint, title);

    // Swapping at the mint is what makes the funds ours: the sender can no
    // longer spend the original proofs, and forged or already-spent tokens
    // are refused here instead of being stored as balance. A swap cannot be
    // retried safely, so it gets a single attempt.
    let fresh: Proof[];
    try {
      fresh = await wallet.receive(wallet.decodeToken(token));
    } catch (error) {
      throw new AgentWalletError(title, errorMessage(error));
    }

    const eventId = await replaceProofEvents(signer, mint, fresh, []);
    return {
      eventId,
      amount: sumProofAmounts(fresh),
      mint,
      proofCount: fresh.length,
    };
  });
}

export async function payInvoiceFromAgentWallet(
  signer: McpNostrSigner,
  invoice: string,
  mintUrl: string = DEFAULT_PAYMENT_MINT
) {
  const title = "Failed to send Cashu payment";
  const mint = await requireSafeMint(mintUrl, title);

  return withWalletLock(signer.getPubKey(), async () => {
    const noProofs = () =>
      new AgentWalletError(
        "No available proofs",
        `No Cashu proofs found for mint ${mintUrl}`
      );

    const stored = (await loadProofEvents(signer)).filter(
      (event) => mintKey(event.mint) === mintKey(mint)
    );
    if (stored.length === 0) throw noProofs();

    const wallet = await openWallet(mint, title);
    const reconciled = await reconcilePendingChange(signer, wallet, mint, stored);
    const events = await pruneSpentProofs(signer, wallet, mint, reconciled);
    // Inputs of unresolved melts stay quarantined until their quote
    // resolves: they may already be spent at the mint.
    const quarantined = new Set(
      events
        .flatMap((event) => event.pendingChange ?? [])
        .flatMap((entry) => entry.inputs)
    );
    const proofs = events
      .flatMap((event) => event.proofs)
      .filter((proof) => !quarantined.has(proof.secret));
    if (proofs.length === 0) throw noProofs();

    const meltQuote = await withMintRetry(
      () => wallet.createMeltQuoteBolt11(invoice),
      { maxAttempts: 4, perAttemptTimeoutMs: 15000, totalTimeoutMs: 60000 }
    );
    const amount = cashuAmountToNumber(meltQuote.amount);
    const feeReserve = meltQuote.fee_reserve
      ? cashuAmountToNumber(meltQuote.fee_reserve)
      : 0;
    const totalNeeded = amount + feeReserve;
    const available = sumProofAmounts(proofs);
    if (available < totalNeeded) {
      throw new AgentWalletError(
        "Insufficient balance",
        `Need ${totalNeeded} sats but only have ${available} sats`
      );
    }

    // Split off just what the invoice needs. The swap spends the input proofs
    // it uses and its outputs only exist in memory, so they are saved before
    // anything else happens: from here on a crash or a failed melt cannot
    // lose them.
    const swap = await safeSwap(
      wallet,
      totalNeeded,
      normalizeProofAmounts(proofs),
      {
        sendConfig: { includeFees: true },
      }
    );
    if (swap.status === "unswapped") {
      throw new AgentWalletError(
        "Cashu payment failed",
        swap.errorMessage ?? "The mint did not accept the swap"
      );
    }
    if (swap.status === "unknown") {
      throw new AgentWalletError(
        "Cashu payment outcome unknown",
        swap.errorMessage ??
          "The swap outcome could not be confirmed. Spent proofs are removed on the next payment."
      );
    }
    // Prepare the NUT-08 blank change outputs up front and persist them
    // inside the staged event: if the melt succeeds but the final write
    // fails (or the process dies), the mint's change signatures can still
    // be unblinded later by reconcilePendingChange. Entries carried from
    // earlier unresolved melts ride along so staging this payment cannot
    // retire their recovery data.
    const carriedChange = events.flatMap((event) => event.pendingChange ?? []);
    let changeOutputs: OutputData[] | undefined;
    let thisChange: PendingChange | undefined;
    // Size the NUT-08 blanks from the ACTUAL excess the mint can turn into
    // change: send inputs minus the quote amount. wallet.send can add mint
    // input fees on top of the quoted fee reserve, so feeReserve alone can
    // under-size (or skip) the blanks.
    const excess = sumProofAmounts(swap.send) - amount;
    if (excess > 0) {
      const keyset = wallet.keyChain.getKeyset();
      // Mirror the wallet's own NUT-08 preparation: ceil(log2(excess))
      // zero-amount blanks.
      const blankCount = Math.ceil(Math.log2(excess)) || 1;
      changeOutputs = OutputData.createRandomData(
        0,
        keyset,
        Array(blankCount).fill(0)
      );
      thisChange = {
        quote: meltQuote.quote,
        keysetId: keyset.id,
        inputs: swap.send.map((proof) => proof.secret),
        outputs: changeOutputs.map((output) => OutputData.serialize(output)),
      };
    }

    const stagedId = await replaceProofEvents(
      signer,
      mint,
      [...swap.keep, ...swap.send],
      events.map((event) => event.id),
      thisChange ? [...carriedChange, thisChange] : carriedChange
    );

    const melt = await safeMeltProofs(wallet, meltQuote, swap.send, {
      changeOutputType: changeOutputs
        ? { type: "custom", data: changeOutputs }
        : undefined,
    });
    if (melt.status !== "paid") {
      // The staged event still holds every proof. If the mint settles a
      // pending melt as paid, the next payment prunes the spent ones.
      throw new AgentWalletError(
        melt.status === "pending"
          ? "Mint payment pending"
          : melt.status === "unknown"
            ? "Cashu payment outcome unknown"
            : "Cashu payment failed",
        melt.errorMessage ?? `Mint reported melt status: ${melt.status}`
      );
    }

    // The invoice is paid at this point no matter what happens next. If the
    // final wallet state cannot be persisted, the staged event still holds
    // every proof and the next payment prunes whatever the mint reports as
    // spent — but the caller must still hear "paid", or it may retry and
    // pay the invoice twice.
    // When the melt call itself succeeded, changeProofs are already
    // unblinded. When safeMeltProofs confirmed PAID via a quote check, the
    // quote carries blinded change signatures instead — unblind them with
    // the persisted outputs now. Only an unblinding failure defers recovery
    // to the next payment.
    let changeProofs = melt.changeProofs;
    let retainedChange = carriedChange;
    if (thisChange && changeProofs.length === 0) {
      const blinded =
        (
          melt.meltQuote as
            | { change?: SerializedBlindedSignature[] }
            | undefined
        )?.change ?? [];
      if (blinded.length > 0) {
        try {
          changeProofs = wallet.createMeltChangeProofs(
            thisChange.outputs.map((output) => OutputData.deserialize(output)),
            blinded
          );
        } catch {
          retainedChange = [...carriedChange, thisChange];
        }
      }
    }

    let eventId: string | null = null;
    let persisted = true;
    try {
      eventId = await replaceProofEvents(
        signer,
        mint,
        [...swap.keep, ...changeProofs],
        stagedId ? [stagedId] : [],
        // This melt's change is now in changeProofs; only entries from
        // earlier, still-unresolved melts carry forward.
        retainedChange
      );
    } catch (error) {
      persisted = false;
      console.warn(
        "Payment succeeded but the wallet state could not be persisted; the next payment will reconcile it:",
        error
      );
    }
    return {
      paid: true,
      amount,
      // The quote's fee reserve. Whatever the mint did not use is in `change`.
      fee: feeReserve,
      mintUrl: mint,
      change: sumProofAmounts(changeProofs),
      eventId,
      persisted,
    };
  });
}
