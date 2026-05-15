import { useContext, useEffect, useRef } from "react";
import {
  Mint as CashuMint,
  Wallet as CashuWallet,
  Proof,
} from "@cashu/cashu-ts";
import {
  PendingMintQuote,
  recoverPendingMintQuotes,
  getPendingMintQuotes,
} from "@/utils/cashu/pending-mint-operations";
import {
  getLocalStorageData,
  publishProofEvent,
} from "@/utils/nostr/nostr-helper-functions";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";

/**
 * Mounted once near the root of the app. On first signer/nostr availability,
 * walks any durable pending mint quotes (left behind by a tab close, network
 * blip, or mint outage during the claim step) and finishes the claim,
 * publishing the recovered proofs back to the user's nostr wallet event.
 *
 * Idempotent: a single in-flight guard prevents concurrent recovery passes,
 * and the recovery driver itself is safe to invoke when there is nothing
 * pending.
 */
export function MintRecoveryBoot(): null {
  const { signer, isAuthStateResolved, isLoggedIn } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);
  const ranOnceRef = useRef(false);

  useEffect(() => {
    if (ranOnceRef.current) return;
    if (!isAuthStateResolved || !isLoggedIn) return;
    if (!signer || !nostr) return;
    if (typeof window === "undefined") return;

    // Cheap pre-check before doing any wallet construction work.
    const pending = getPendingMintQuotes();
    if (pending.length === 0) {
      ranOnceRef.current = true;
      return;
    }

    ranOnceRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const result = await recoverPendingMintQuotes({
          buildWallet: async (mintUrl: string) => {
            const wallet = new CashuWallet(new CashuMint(mintUrl));
            await wallet.loadMint();
            return wallet;
          },
          onProofsClaimed: async (quote: PendingMintQuote, proofs: Proof[]) => {
            if (cancelled) return;
            const { tokens, history } = getLocalStorageData();
            const proofArray = [...tokens, ...proofs];
            window.localStorage.setItem("tokens", JSON.stringify(proofArray));
            window.localStorage.setItem(
              "history",
              JSON.stringify([
                {
                  type: 3,
                  amount: quote.amount,
                  date: Math.floor(Date.now() / 1000),
                },
                ...history,
              ])
            );
            await publishProofEvent(
              nostr,
              signer,
              quote.mintUrl,
              proofs,
              "in",
              quote.amount.toString()
            );
          },
        });

        if (result.recovered > 0 || result.abandoned > 0) {
          console.info(
            `[mint-recovery] processed ${result.total} pending quote(s):`,
            result
          );
        }
      } catch (err) {
        console.warn("[mint-recovery] boot pass failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signer, nostr, isAuthStateResolved, isLoggedIn]);

  return null;
}
