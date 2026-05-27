import {
  Mint as CashuMint,
  Wallet as CashuWallet,
  Keyset as MintKeyset,
  Proof,
} from "@cashu/cashu-ts";
import { proofAmountToNumber } from "@/utils/cashu/proof-amount";

export interface ProofEventLike {
  mint: string;
  proofs: Proof[];
  created_at?: number;
}

const TOKENS_KEY = "tokens";
const MINTS_KEY = "mints";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getStoredMints(): string[] {
  if (typeof window === "undefined") return [];
  return safeParse<string[]>(localStorage.getItem(MINTS_KEY), []);
}

export function getStoredTokens(): Proof[] {
  if (typeof window === "undefined") return [];
  return safeParse<Proof[]>(localStorage.getItem(TOKENS_KEY), []);
}

function dispatchStorageChange() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event("storage"));
  } catch {
    /* ignore */
  }
}

/**
 * Write a deduplicated, ordered list of mints to localStorage. The first
 * element becomes the wallet's default mint. No-op if the list would be
 * empty or unchanged.
 */
export function persistMints(orderedMints: string[]): string[] {
  if (typeof window === "undefined") return orderedMints;
  const deduped: string[] = [];
  for (const m of orderedMints) {
    if (typeof m === "string" && m && !deduped.includes(m)) deduped.push(m);
  }
  if (deduped.length === 0) return [];
  const current = getStoredMints();
  const unchanged =
    current.length === deduped.length &&
    current.every((m, i) => m === deduped[i]);
  if (!unchanged) {
    localStorage.setItem(MINTS_KEY, JSON.stringify(deduped));
    dispatchStorageChange();
  }
  return deduped;
}

/**
 * Merge incoming proofs into localStorage["tokens"] (dedup by secret) and
 * make `mintUrl` the default mint (index 0 of `mints`). Returns the merged
 * proof array and the reordered mints array.
 *
 * Use this any time we credit the buyer's local wallet — receive-button,
 * claim-button, failed-payment recovery, post-mint claim, etc. It enforces
 * the rule "latest tokens added switch the default mint to their mint".
 */
export function persistReceivedTokens(
  newProofs: Proof[],
  mintUrl: string
): { tokens: Proof[]; mints: string[] } {
  if (typeof window === "undefined") {
    return { tokens: [...newProofs], mints: [mintUrl] };
  }
  const existing = getStoredTokens();
  const seen = new Set(existing.map((p) => p.secret));
  const merged = [
    ...existing,
    ...newProofs.filter((p) => p && !seen.has(p.secret)),
  ];
  localStorage.setItem(TOKENS_KEY, JSON.stringify(merged));

  const currentMints = getStoredMints();
  const reordered = mintUrl
    ? [mintUrl, ...currentMints.filter((m) => m !== mintUrl)]
    : currentMints;
  const finalMints = persistMints(reordered);
  dispatchStorageChange();
  return { tokens: merged, mints: finalMints };
}

/**
 * Inspect the kind-7375 proof events cached in the wallet context to map
 * every locally-stored proof's secret back to the mint URL that issued it.
 * Any mint referenced by current tokens but missing from localStorage["mints"]
 * is appended. If tokens come from only one mint, that mint is promoted to
 * index 0 (default).
 *
 * Returns the (possibly updated) mints array.
 */
export function buildSecretToMintMap(
  proofEvents: ProofEventLike[]
): Map<string, string> {
  // Walk events oldest-first so newer events overwrite older mappings — if
  // the same proof secret ever appears under two mints (shouldn't happen,
  // but a re-issue or rotation could surface it), the latest wins.
  const ordered = [...(proofEvents || [])].sort(
    (a, b) => (a.created_at ?? 0) - (b.created_at ?? 0)
  );
  const secretToMint = new Map<string, string>();
  for (const ev of ordered) {
    if (!ev?.mint || !Array.isArray(ev.proofs)) continue;
    for (const p of ev.proofs) {
      if (p?.secret) secretToMint.set(p.secret, ev.mint);
    }
  }
  return secretToMint;
}

export function syncMintsFromTokens(proofEvents: ProofEventLike[]): string[] {
  if (typeof window === "undefined") return getStoredMints();
  const tokens = getStoredTokens();
  const currentMints = getStoredMints();
  if (tokens.length === 0) return currentMints;

  const secretToMint = buildSecretToMintMap(proofEvents);

  const tokenMintsInOrder: string[] = [];
  for (const t of tokens) {
    const m = secretToMint.get(t.secret);
    if (m && !tokenMintsInOrder.includes(m)) tokenMintsInOrder.push(m);
  }
  if (tokenMintsInOrder.length === 0) return currentMints;

  let next = [...currentMints];
  for (const m of tokenMintsInOrder) {
    if (!next.includes(m)) next.push(m);
  }

  // Promote the mint with the most recent kind-7375 proof event whose proofs
  // are still held locally. created_at is authoritative — it survives token
  // array reorderings from refetches that mere insertion-order can't. Ties
  // are broken by mint URL (lexicographic) so the result is deterministic
  // regardless of how the proofEvents array is ordered upstream.
  const liveSecrets = new Set(tokens.map((t) => t.secret));
  const candidates: { mint: string; ts: number }[] = [];
  for (const ev of proofEvents || []) {
    if (!ev?.mint || !Array.isArray(ev.proofs)) continue;
    const stillHeld = ev.proofs.some(
      (p) => p?.secret && liveSecrets.has(p.secret)
    );
    if (!stillHeld) continue;
    candidates.push({ mint: ev.mint, ts: ev.created_at ?? 0 });
  }
  candidates.sort((a, b) => b.ts - a.ts || a.mint.localeCompare(b.mint));
  const latestMint = candidates[0]?.mint;
  if (latestMint && next[0] !== latestMint) {
    next = [latestMint, ...next.filter((m) => m !== latestMint)];
  }

  return persistMints(next);
}

/**
 * Sum proofs per mint using the proof-event mint mapping as the source of
 * truth. This avoids the loadMint/keyset round-trip for the common case,
 * which is what was causing the "0 sats" flashes and stale balances in
 * multi-mint wallets.
 *
 * Any proof whose secret is not present in `proofEvents` (e.g. just
 * received and not yet republished, or from an older wallet that didn't
 * publish kind-7375) is bucketed as "unattributed" and returned separately
 * so the caller can decide how to surface it.
 */
export function balancesByMint(
  proofEvents: ProofEventLike[],
  tokens: Proof[]
): { byMint: Map<string, number>; unattributed: number } {
  const secretToMint = buildSecretToMintMap(proofEvents);
  const byMint = new Map<string, number>();
  let unattributed = 0;
  for (const p of tokens) {
    const amt = proofAmountToNumber(p);
    const m = p?.secret ? secretToMint.get(p.secret) : undefined;
    if (m) byMint.set(m, (byMint.get(m) ?? 0) + amt);
    else unattributed += amt;
  }
  return { byMint, unattributed };
}

interface MintBalanceProbe {
  mint: string;
  balance: number;
  keysetIds: Set<string>;
}

async function probeMint(
  mintUrl: string,
  tokens: Proof[]
): Promise<MintBalanceProbe | null> {
  try {
    const wallet = new CashuWallet(new CashuMint(mintUrl));
    await wallet.loadMint();
    const keysets = await wallet.keyChain.getKeysets();
    const ids = new Set<string>((keysets || []).map((k: MintKeyset) => k.id));
    const matching = tokens.filter((p) => ids.has(p.id));
    const balance = matching.reduce(
      (acc, p) => acc + proofAmountToNumber(p),
      0
    );
    return { mint: mintUrl, balance, keysetIds: ids };
  } catch {
    return null;
  }
}

/**
 * Pick the best mint to spend `amount` sats from, given the user's stored
 * tokens. Iterates the user's mints in order (default first), loads each
 * mint's keysets, and returns the first one whose token balance is >=
 * `amount`. Falls back to the mint with the highest available balance, or
 * `mints[0]` when no balances can be probed. Returns null only when no
 * mints are configured at all.
 *
 * Use at payment time so that a stale or wrong default mint does not cause
 * "not enough funds" when funds actually exist under a different mint in
 * the user's wallet.
 */
export async function pickMintForPayment(
  amount: number,
  mints: string[],
  tokens: Proof[]
): Promise<string | null> {
  const ordered = (mints || []).filter(Boolean);
  if (ordered.length === 0) return null;
  if (ordered.length === 1) return ordered[0]!;

  const probes: MintBalanceProbe[] = [];
  for (const m of ordered) {
    const probe = await probeMint(m, tokens);
    if (probe) {
      probes.push(probe);
      if (probe.balance >= amount) return probe.mint;
    }
  }
  if (probes.length === 0) return ordered[0]!;
  // No mint individually covers `amount` — pick the richest so the
  // downstream swap surfaces the real shortfall against the best option.
  probes.sort((a, b) => b.balance - a.balance);
  return probes[0]!.mint;
}
