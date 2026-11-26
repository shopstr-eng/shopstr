import { useContext, useEffect, useMemo, useState } from "react";
import { StorefrontColorScheme } from "@/utils/types/types";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";
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
import { sumProofAmounts } from "@/utils/cashu/proof-amount";
import { STORAGE_KEYS } from "@/utils/storage";
import { useLocalStorageSubscription } from "@/utils/hooks/useLocalStorageSubscription";

interface StorefrontWalletProps {
  colors: StorefrontColorScheme;
}

export default function StorefrontWallet({ colors }: StorefrontWalletProps) {
  const { isLoggedIn } = useContext(SignerContext);
  const router = useRouter();

  const [mint, setMint] = useState("");
  const [wallet, setWallet] = useState<CashuWallet>();
  const [mintKeySetIds, setMintKeySetIds] = useState<MintKeyset[]>([]);

  const localStorageData = useMemo(() => getLocalStorageData(), []);
  const { mints, tokens: initialTokens } = localStorageData;

  const liveTokens = useLocalStorageSubscription<Proof[]>(
    STORAGE_KEYS.TOKENS,
    () => getLocalStorageData().tokens as Proof[],
    (initialTokens as Proof[]) ?? []
  );

  useEffect(() => {
    if (mints && mints[0]) {
      const currentMint = new CashuMint(mints[0]);
      setMint(mints[0]);
      const cashuWallet = new CashuWallet(currentMint);
      setWallet(cashuWallet);
    }
  }, [mints]);

  useEffect(() => {
    const fetchLocalKeySet = async () => {
      if (wallet) {
        await wallet.loadMint();
        const mintKeySetIdsArray = await wallet.keyChain.getKeysets();
        if (mintKeySetIdsArray) {
          setMintKeySetIds(mintKeySetIdsArray);
        }
      }
    };
    fetchLocalKeySet();
  }, [wallet]);

  const filteredProofs = useMemo(() => {
    if (mints && liveTokens && mintKeySetIds) {
      return liveTokens.filter((p: Proof) =>
        mintKeySetIds?.some((keysetId: MintKeyset) => keysetId.id === p.id)
      );
    }
    return [];
  }, [mintKeySetIds, mints, liveTokens]);

  const totalBalance = useMemo(() => {
    return liveTokens && liveTokens.length >= 1
      ? sumProofAmounts(liveTokens)
      : 0;
  }, [liveTokens]);

  const walletBalance = useMemo(() => {
    return filteredProofs.length >= 1 ? sumProofAmounts(filteredProofs) : 0;
  }, [filteredProofs]);

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
        <p className="text-lg opacity-50">
          Please sign in to view your wallet.
        </p>
        <button
          onClick={() => router.push("/marketplace")}
          className="mt-6 rounded-lg px-6 py-3 font-bold transition-opacity hover:opacity-90"
          style={{ backgroundColor: colors.primary, color: colors.secondary }}
        >
          Go to Marketplace
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div
        className="mb-6 rounded-xl border-2 p-6"
        style={{ borderColor: colors.primary + "44" }}
      >
        <h2
          className="font-heading mb-4 text-2xl font-bold"
          style={{ color: "var(--sf-text)" }}
        >
          Wallet
        </h2>
        <div className="mb-4 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="opacity-60">Total Balance</span>
            <span
              className="text-xl font-bold"
              style={{ color: colors.primary }}
            >
              {totalBalance} sats
            </span>
          </div>
          {mint && (
            <div className="flex items-center justify-between">
              <span className="opacity-60">Mint Balance</span>
              <span className="font-semibold">{walletBalance} sats</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {wallet && (
            <>
              <MintButton />
              <ReceiveButton />
              <SendButton />
              <PayButton />
            </>
          )}
        </div>
      </div>
      <Transactions />
    </div>
  );
}
