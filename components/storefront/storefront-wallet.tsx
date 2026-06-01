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

interface StorefrontWalletProps {
  colors: StorefrontColorScheme;
}

export default function StorefrontWallet({ colors }: StorefrontWalletProps) {
  const { isLoggedIn } = useContext(SignerContext);
  const router = useRouter();

  const [totalBalance, setTotalBalance] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [mint, setMint] = useState("");
  const [wallet, setWallet] = useState<CashuWallet>();
  const [mintKeySetIds, setMintKeySetIds] = useState<MintKeyset[]>([]);

  const localStorageData = useMemo(() => getLocalStorageData(), []);
  const { mints, tokens } = localStorageData;

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
        const mintKeySetIdsArray = await wallet.keyChain.getKeysets();
        if (mintKeySetIdsArray) {
          setMintKeySetIds(mintKeySetIdsArray);
        }
      }
    };
    fetchLocalKeySet();
  }, [wallet]);

  const filteredProofs = useMemo(() => {
    if (mints && tokens && mintKeySetIds) {
      return tokens.filter((p: Proof) =>
        mintKeySetIds?.some((keysetId: MintKeyset) => keysetId.id === p.id)
      );
    }
    return [];
  }, [mintKeySetIds, mints, tokens]);

  useEffect(() => {
    if (tokens) {
      const tokensTotal =
        tokens.length >= 1
          ? tokens.reduce(
              (acc: number, token: Proof) => acc + token.amount.toNumber(),
              0
            )
          : 0;
      setTotalBalance(tokensTotal);
    }
    const walletTotal =
      filteredProofs.length >= 1
        ? filteredProofs.reduce(
            (acc: number, p: Proof) => acc + p.amount.toNumber(),
            0
          )
        : 0;
    setWalletBalance(walletTotal);
  }, [tokens, filteredProofs]);

  useEffect(() => {
    const interval = setInterval(() => {
      const { tokens: newTokens } = getLocalStorageData();
      if (newTokens) {
        const tokensTotal =
          newTokens.length >= 1
            ? newTokens.reduce(
                (acc: number, token: Proof) => acc + token.amount.toNumber(),
                0
              )
            : 0;
        setTotalBalance(tokensTotal);
        if (mintKeySetIds) {
          const newFilteredProofs = newTokens.filter((p: Proof) =>
            mintKeySetIds.some((keysetId: MintKeyset) => keysetId.id === p.id)
          );
          const newWalletTotal =
            newFilteredProofs.length >= 1
              ? newFilteredProofs.reduce(
                  (acc: number, p: Proof) => acc + p.amount.toNumber(),
                  0
                )
              : 0;
          setWalletBalance(newWalletTotal);
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [mintKeySetIds]);

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
