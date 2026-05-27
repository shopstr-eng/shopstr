import { useState, useEffect, useContext } from "react";
import { useRouter } from "next/router";
import MintButton from "../../components/wallet/mint-button";
import ReceiveButton from "../../components/wallet/receive-button";
import SendButton from "../../components/wallet/send-button";
import PayButton from "../../components/wallet/pay-button";
import Transactions from "../../components/wallet/transactions";
import {
  Mint as CashuMint,
  Wallet as CashuWallet,
  Keyset as MintKeyset,
  Proof,
} from "@cashu/cashu-ts";
import ProtectedRoute from "@/components/utility-components/protected-route";
import { proofAmountToNumber } from "@/utils/cashu/proof-amount";
import {
  buildSecretToMintMap,
  getStoredMints,
  getStoredTokens,
  restoreTokensFromProofEvents,
  syncMintsFromTokens,
} from "@/utils/cashu/wallet-mint-sync";
import { CashuWalletContext } from "@/utils/context/context";

const Wallet = () => {
  const [totalBalance, setTotalBalance] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [mint, setMint] = useState("");
  const [mintKeySetIds, setMintKeySetIds] = useState<MintKeyset[]>([]);
  const [mints, setMints] = useState<string[]>([]);
  const [tokens, setTokens] = useState<Proof[]>([]);
  // Bumped to force a keyset reload — used both for periodic retry after a
  // failed loadMint and to re-attribute proofs after spend/receive activity
  // (token count change), so the multi-mint balance cannot stay stale.
  const [keysetRetryTick, setKeysetRetryTick] = useState(0);
  const walletContext = useContext(CashuWalletContext);
  const router = useRouter();

  // Reactive view of localStorage — re-read on storage events emitted by the
  // wallet writers and on a slow poll so older same-tab writes don't get
  // missed. Each reload runs syncMintsFromTokens so a mint discovered via
  // proof-events is automatically promoted into the configured mint list.
  //
  // Compare parsed values by JSON identity before calling the setters so the
  // 2.1s poll cannot trigger needless re-renders (which previously caused
  // mints/keysets to be reloaded every tick and led to transient 0 balances
  // while keysets were being re-fetched).
  useEffect(() => {
    let lastMintsJson = "";
    let lastTokensJson = "";
    const reload = () => {
      const syncedMints = syncMintsFromTokens(walletContext.proofEvents || []);
      const nextMints = syncedMints.length ? syncedMints : getStoredMints();
      const nextTokens = getStoredTokens();
      const mintsJson = JSON.stringify(nextMints);
      const tokensJson = JSON.stringify(nextTokens);
      if (mintsJson !== lastMintsJson) {
        lastMintsJson = mintsJson;
        setMints(nextMints);
      }
      if (tokensJson !== lastTokensJson) {
        lastTokensJson = tokensJson;
        setTokens(nextTokens);
      }
    };
    reload();
    window.addEventListener("storage", reload);
    const interval = setInterval(reload, 2100);
    return () => {
      window.removeEventListener("storage", reload);
      clearInterval(interval);
    };
  }, [walletContext.proofEvents]);

  useEffect(() => {
    if (!mints || !mints[0]) {
      setMint("");
      setMintKeySetIds([]);
      return;
    }
    let cancelled = false;
    const activeMint = mints[0];
    setMint(activeMint);
    const cashuWallet = new CashuWallet(new CashuMint(activeMint));
    cashuWallet
      .loadMint()
      .then(() => cashuWallet.keyChain.getKeysets())
      .then((keysets) => {
        if (!cancelled && keysets) setMintKeySetIds(keysets);
      })
      .catch((err) => {
        console.warn("Wallet loadMint failed:", err);
        if (!cancelled) setMintKeySetIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mints, tokens.length, keysetRetryTick]);

  // Periodic retry while keysets are missing — guards against a single
  // loadMint failure leaving the multi-mint wallet stuck on a stale balance
  // (since dedup removed the accidental retry we used to get from re-renders).
  useEffect(() => {
    if (!mints[0] || mintKeySetIds.length > 0) return;
    const t = setTimeout(() => setKeysetRetryTick((n) => n + 1), 5000);
    return () => clearTimeout(t);
  }, [mints, mintKeySetIds]);

  // Total = every proof in the wallet. Active-mint balance = proofs whose
  // kind-7375 mapping points at mints[0], plus any unmapped proofs that
  // belong to mints[0] by keyset id (fallback for proofs the user has but
  // hasn't published a proof event for yet).
  useEffect(() => {
    const total = tokens.reduce(
      (acc: number, p: Proof) => acc + proofAmountToNumber(p),
      0
    );
    setTotalBalance(total);

    const activeMint = mints[0];
    if (!activeMint) {
      setWalletBalance(0);
      return;
    }

    const secretToMint = buildSecretToMintMap(walletContext.proofEvents || []);
    let fromMapping = 0;
    let unattributedTotal = 0;
    const unattributedProofs: Proof[] = [];
    for (const p of tokens) {
      const m = p?.secret ? secretToMint.get(p.secret) : undefined;
      const amt = proofAmountToNumber(p);
      if (m === activeMint) fromMapping += amt;
      else if (!m) {
        unattributedTotal += amt;
        unattributedProofs.push(p);
      }
    }

    let fromUnattributed = 0;
    if (unattributedTotal > 0) {
      if (mintKeySetIds.length > 0) {
        fromUnattributed = unattributedProofs
          .filter((p) => mintKeySetIds.some((k: MintKeyset) => k.id === p.id))
          .reduce((acc, p) => acc + proofAmountToNumber(p), 0);
      } else if (mints.length === 1) {
        fromUnattributed = unattributedTotal;
      }
    }

    const computed = fromMapping + fromUnattributed;
    // Avoid flashing 0 in the multi-mint window where proof events are
    // still loading and keysets haven't returned yet — keep the last known
    // balance until we have something to attribute.
    if (
      computed === 0 &&
      total > 0 &&
      mints.length > 1 &&
      mintKeySetIds.length === 0 &&
      (walletContext.proofEvents?.length ?? 0) === 0
    ) {
      return;
    }
    setWalletBalance(computed);
  }, [tokens, mintKeySetIds, mints, walletContext.proofEvents]);

  const handleMintClick = () => {
    router.push("/settings/account");
  };

  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const handleRestore = () => {
    try {
      const { restoredCount, restoredSats } = restoreTokensFromProofEvents(
        walletContext.proofEvents || []
      );
      if (restoredCount === 0) {
        setRestoreStatus(
          "Nothing to restore — your local wallet already matches your nostr backup."
        );
      } else {
        setRestoreStatus(
          `Restored ${restoredCount} proof${
            restoredCount === 1 ? "" : "s"
          } (${restoredSats} sats) from nostr backup.`
        );
      }
    } catch (err) {
      console.error("Restore failed:", err);
      setRestoreStatus("Restore failed — see console for details.");
    }
    setTimeout(() => setRestoreStatus(null), 6000);
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen flex-col bg-white px-4 pt-[8rem] pb-8">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          {/* Balance Card with Neo-brutalist Design */}
          <div className="bg-primary-blue rounded-md border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <h1 className="mb-2 text-center text-6xl font-bold text-white">
              {totalBalance} sats
            </h1>
            <p
              className="mb-6 cursor-pointer text-center text-sm break-words text-blue-300 transition-colors hover:text-blue-200"
              onClick={handleMintClick}
            >
              {mint}: {walletBalance} sats
            </p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="flex items-center justify-center">
                <ReceiveButton />
              </div>
              <div className="flex items-center justify-center">
                <SendButton />
              </div>
              <div className="flex items-center justify-center">
                <MintButton />
              </div>
              <div className="flex items-center justify-center">
                <PayButton />
              </div>
            </div>
          </div>

          {/* Restore from nostr backup — rebuilds local wallet from your
              kind-7375 proof events. Merge-only; never deletes existing proofs. */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleRestore}
              className="rounded-md border-2 border-black bg-white px-4 py-2 text-sm font-bold text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100"
            >
              Restore wallet from nostr backup
            </button>
            {restoreStatus ? (
              <p className="text-center text-xs text-white">{restoreStatus}</p>
            ) : null}
          </div>

          {/* Transactions Card with Neo-brutalist Design */}
          <div className="bg-primary-blue overflow-hidden rounded-md border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <Transactions />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default Wallet;
