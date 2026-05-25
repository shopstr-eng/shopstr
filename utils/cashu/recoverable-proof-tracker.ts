import type { Proof } from "@cashu/cashu-ts";

/**
 * Tracks which proofs the buyer can still recover at any point during the
 * post-mint `sendTokens` flow.
 *
 * After the buyer's Lightning payment is minted into a set of cashu `proofs`,
 * those original proofs are progressively transformed (`safeSwap`,
 * `safeMeltProofs`) and transmitted to the seller / donation recipients via
 * gift-wrapped cashu tokens. If the flow throws partway through, naively
 * stashing the original mint outputs is wrong: most of them are already SPENT
 * on the mint, and the *real* recoverable value is some mix of intermediate
 * swap outputs and unspent change.
 *
 * Callers update the tracker as work progresses:
 *   - `replaceFromSwap(input, [keep, send])` after a successful `safeSwap`.
 *   - `replaceFromMelt(sent, change)` after a successful `safeMeltProofs`
 *     (`sent` is the proofs consumed by the melt; `change` is the mint's
 *     change output, which is still recoverable).
 *   - `consume(proofs)` once a proof-carrying gift-wrapped message has been
 *     successfully published (the recipient can now claim, so the buyer
 *     should no longer try to re-stash these into their own wallet).
 *
 * On failure the catch site reads `tracker.getProofs()` for the live
 * recoverable set and stashes that — which may include never-swapped
 * leftovers, swap outputs that hadn't been transmitted yet, and melt change.
 */
export class RecoverableProofTracker {
  private bySecret: Map<string, Proof> = new Map();

  constructor(initial: Proof[] = []) {
    this.add(initial);
  }

  add(proofs: Proof[] | undefined | null): void {
    if (!proofs || proofs.length === 0) return;
    for (const p of proofs) {
      if (p && typeof p.secret === "string" && !this.bySecret.has(p.secret)) {
        this.bySecret.set(p.secret, p);
      }
    }
  }

  remove(proofs: Proof[] | undefined | null): void {
    if (!proofs || proofs.length === 0) return;
    for (const p of proofs) {
      if (p && typeof p.secret === "string") {
        this.bySecret.delete(p.secret);
      }
    }
  }

  /**
   * Convenience helper: after a successful `safeSwap`, the input proofs are
   * SPENT on the mint and the new `keep` + `send` outputs are UNSPENT.
   */
  replaceFromSwap(
    input: Proof[] | undefined | null,
    keep: Proof[] | undefined | null,
    send: Proof[] | undefined | null
  ): void {
    this.remove(input);
    this.add(keep);
    this.add(send);
  }

  /**
   * Convenience helper: after a successful `safeMeltProofs`, the proofs fed
   * into the melt are SPENT on the mint and only the change is still
   * recoverable client-side.
   */
  replaceFromMelt(
    spent: Proof[] | undefined | null,
    change: Proof[] | undefined | null
  ): void {
    this.remove(spent);
    this.add(change);
  }

  /**
   * Mark proofs as consumed because a gift-wrapped cashu token carrying
   * them was successfully published to the recipient.
   */
  consume(proofs: Proof[] | undefined | null): void {
    this.remove(proofs);
  }

  getProofs(): Proof[] {
    return Array.from(this.bySecret.values());
  }

  size(): number {
    return this.bySecret.size;
  }

  getAmountSats(): number {
    let total = 0;
    for (const p of this.bySecret.values()) {
      const raw = p.amount as unknown;
      const v =
        typeof raw === "number"
          ? raw
          : typeof (raw as { toNumber?: () => number })?.toNumber === "function"
            ? (raw as { toNumber: () => number }).toNumber()
            : Number(raw);
      if (Number.isFinite(v)) total += v;
    }
    return total;
  }
}

/**
 * Thrown out of `sendTokens` when the post-mint distribution flow fails
 * partway through. Carries the live set of proofs the buyer can still
 * recover so the caller stashes the right value into the buyer's wallet
 * instead of the original (now-mostly-spent) mint outputs.
 */
export class SendTokensRecoverableError extends Error {
  recoverableProofs: Proof[];
  mintUrl: string;
  cause?: unknown;

  constructor(
    message: string,
    recoverableProofs: Proof[],
    mintUrl: string,
    cause?: unknown
  ) {
    super(message);
    this.name = "SendTokensRecoverableError";
    this.recoverableProofs = recoverableProofs;
    this.mintUrl = mintUrl;
    this.cause = cause;
  }
}
