import { useContext, useEffect, useState } from "react";
import { StorefrontColorScheme } from "@/utils/types/types";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import MintButton from "@/components/wallet/mint-button";
import ReceiveButton from "@/components/wallet/receive-button";
import SendButton from "@/components/wallet/send-button";
import PayButton from "@/components/wallet/pay-button";
import Transactions from "@/components/wallet/transactions";
import {
  Mint as CashuMint,
  Wallet as CashuWallet,
  Keyset as MintKeyset,
  Proof,
} from "@cashu/cashu-ts";
import { useRouter } from "next/router";
import { proofAmountToNumber } from "@/utils/cashu/proof-amount";
import {
  buildSecretToMintMap,
  getStoredMints,
  getStoredTokens,
  restoreTokensFromProofEvents,
  syncMintsFromTokens,
} from "@/utils/cashu/wallet-mint-sync";
import { CashuWalletContext } from "@/utils/context/context";

interface StorefrontWalletProps {
  colors: StorefrontColorScheme;
}

export default function StorefrontWallet({ colors }: StorefrontWalletProps) {
  const { isLoggedIn } = useContext(SignerContext);
  const walletContext = useContext(CashuWalletContext);
  const router = useRouter();

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

  // Reactive view of localStorage — re-read on any storage event (which the
  // wallet writers fire) and on a slow poll as a safety net for same-tab
  // writes that some older code paths may still emit without an event.
  //
  // We compare the parsed values against the previous state by JSON identity
  // before calling the setters so the poll cannot trigger needless re-renders
  // (which previously caused mints/keysets to be reloaded every 2.1s and led
  // to transient wrong balances while keysets were being re-fetched).
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

  // Load keysets for the active default mint so we can attribute proofs to it.
  // Re-runs when the default mint changes, when token activity occurs (so a
  // spend/receive forces a fresh attribution), and on a periodic retry tick
  // when a previous loadMint attempt failed.
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
        console.warn("Storefront wallet loadMint failed:", err);
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

    // Unattributed proofs (no mint mapping yet) get resolved by keyset id
    // when keysets are loaded. While keysets are loading we optimistically
    // credit them to the active mint when it is the only one configured.
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
    // balance until we have something to attribute. Only release the guard
    // when there are no tokens at all (truly empty wallet).
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

  if (!isLoggedIn) {
    return (
      <div className="py-24 text-center">
        <h2
          className="font-heading text-2xl font-bold"
          style={{ color: colors.text }}
        >
          Sign in to access your Bitcoin wallet
        </h2>
        <p className="mt-2 text-sm" style={{ color: colors.text + "99" }}>
          Sign in to send, receive, and manage your Bitcoin (Cashu ecash)
          wallet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col px-4 pt-8 pb-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div
          className="rounded-md border-4 p-8"
          style={{
            borderColor: colors.text,
            backgroundColor: colors.secondary,
            boxShadow: `8px 8px 0px 0px ${colors.text}`,
          }}
        >
          <h1
            className="mb-2 text-center text-6xl font-bold"
            style={{ color: colors.background }}
          >
            {totalBalance} sats
          </h1>
          {mint ? (
            <p
              className="mb-6 cursor-pointer text-center text-sm break-words transition-colors hover:opacity-80"
              style={{ color: colors.accent }}
              onClick={handleMintClick}
            >
              {mint}: {walletBalance} sats
            </p>
          ) : (
            <p
              className="mb-6 cursor-pointer text-center text-sm break-words transition-colors hover:opacity-80"
              style={{ color: colors.accent }}
              onClick={handleMintClick}
            >
              No mint configured — tap to set up
            </p>
          )}
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

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={handleRestore}
            className="rounded-md border-2 border-black bg-white px-4 py-2 text-sm font-bold text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100"
            style={{ color: colors.text, borderColor: colors.text }}
          >
            Restore wallet from nostr backup
          </button>
          {restoreStatus ? (
            <p
              className="text-center text-xs"
              style={{ color: colors.background }}
            >
              {restoreStatus}
            </p>
          ) : null}
        </div>

        <div
          className="overflow-hidden rounded-md border-4"
          style={{
            borderColor: colors.text,
            backgroundColor: colors.secondary,
            boxShadow: `8px 8px 0px 0px ${colors.text}`,
          }}
        >
          <Transactions />
        </div>
      </div>
    </div>
  );
}
