import type { Proof } from "@cashu/cashu-ts";
import { persistReceivedTokens } from "@/utils/cashu/wallet-mint-sync";

export interface StashedHistoryEntry {
  type: number;
  amount: number;
  date: number;
  mint?: string;
  note?: string;
}

/**
 * Merge cashu proofs into the browser's local wallet (`localStorage["tokens"]`)
 * and append a recovery note to `localStorage["history"]`.
 *
 * Used when an outbound payment to the seller fails AFTER the buyer's mint has
 * already issued proofs from a Lightning payment — the funds exist on the
 * mint and we don't want them to silently vanish on the client. A separate
 * recovery modal then prompts the user to sign in / create an account so they
 * can spend the stashed proofs from the wallet UI.
 *
 * Safe to call from non-browser contexts (no-ops if `window` is undefined).
 *
 * Returns the total stashed amount in sats.
 */
export function stashProofsLocally(
  proofs: Proof[],
  mintUrl: string,
  options: { note?: string } = {}
): number {
  if (typeof window === "undefined") return 0;
  if (!Array.isArray(proofs) || proofs.length === 0) return 0;

  const amount = proofs.reduce((acc, p) => {
    const v =
      typeof p.amount === "number"
        ? p.amount
        : typeof (p.amount as unknown as { toNumber?: () => number })
              ?.toNumber === "function"
          ? (p.amount as unknown as { toNumber: () => number }).toNumber()
          : Number(p.amount);
    return acc + (Number.isFinite(v) ? v : 0);
  }, 0);

  // Merge proofs into the wallet AND promote `mintUrl` to default so the
  // wallet UI recognizes the recovered balance against the right keysets.
  persistReceivedTokens(proofs, mintUrl);

  try {
    const existingHistory = JSON.parse(
      localStorage.getItem("history") || "[]"
    ) as StashedHistoryEntry[];
    const entry: StashedHistoryEntry = {
      type: 4,
      amount,
      date: Math.floor(Date.now() / 1000),
      mint: mintUrl,
      note: options.note ?? "Recovered from failed payment",
    };
    localStorage.setItem(
      "history",
      JSON.stringify([entry, ...existingHistory])
    );
  } catch {
    /* ignore history write errors — proofs are the source of truth */
  }

  return amount;
}
