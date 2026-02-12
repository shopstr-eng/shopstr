import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";
import MintButton from "../../components/wallet/mint-button";
import ReceiveButton from "../../components/wallet/receive-button";
import SendButton from "../../components/wallet/send-button";
import PayButton from "../../components/wallet/pay-button";
import Transactions from "../../components/wallet/transactions";
import { CashuMint, CashuWallet, MintKeyset, Proof } from "@cashu/cashu-ts";

const Wallet = () => {
  const [totalBalance, setTotalBalance] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [mint, setMint] = useState("");
  const [wallet, setWallet] = useState<CashuWallet>();
  const [mintKeySetIds, setMintKeySetIds] = useState<MintKeyset[]>([]);
  const router = useRouter();

  const localStorageData = useMemo(() => getLocalStorageData(), []);
  const { mints, tokens } = localStorageData;

  useEffect(() => {
    const currentMint = new CashuMint(mints[0]!);
    setMint(mints[0]!);
    const cashuWallet = new CashuWallet(currentMint);
    setWallet(cashuWallet);
  }, [mints]);

  useEffect(() => {
    const fetchLocalKeySet = async () => {
      if (wallet) {
        const mintKeySetIdsArray = await wallet.getKeySets();
        if (mintKeySetIdsArray) {
          setMintKeySetIds(mintKeySetIdsArray);
        }
      }
    };
    fetchLocalKeySet();
  }, [wallet]);

  const filteredProofs = useMemo(() => {
    if (mints && tokens && mintKeySetIds) {
      return tokens.filter(
        (p: Proof) =>
          mintKeySetIds?.some((keysetId: MintKeyset) => keysetId.id === p.id)
      );
    }
    return [];
  }, [mintKeySetIds, mints, tokens]);

  useEffect(() => {
    if (tokens) {
      const tokensTotal =
        tokens.length >= 1
          ? tokens.reduce((acc, token: Proof) => acc + token.amount, 0)
          : 0;
      setTotalBalance(tokensTotal);
    }

    const walletTotal =
      filteredProofs.length >= 1
        ? filteredProofs.reduce((acc, p: Proof) => acc + p.amount, 0)
        : 0;
    setWalletBalance(walletTotal);
  }, [tokens, filteredProofs]);

  useEffect(() => {
    const interval = setInterval(() => {
      // Optimization: Do not poll if the tab is in the background
      if (document.hidden) return;
      const { tokens: newTokens } = getLocalStorageData();
      if (newTokens) {
        const tokensTotal =
          newTokens.length >= 1
            ? newTokens.reduce(
                (acc: number, token: Proof) => acc + token.amount,
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
                  (acc: number, p: Proof) => acc + p.amount,
                  0
                )
              : 0;
          setWalletBalance(newWalletTotal);
        }
      }
    }, 2100);

    return () => clearInterval(interval);
  }, [mintKeySetIds]);

  const handleMintClick = () => {
    router.push("/settings/preferences");
  };

  return (
    <>
      <div className="flex min-h-screen flex-col items-center bg-[#050505] px-4 pt-24 md:pt-36">
        <div className="w-full max-w-4xl space-y-8">
          {/* Balance & Actions Card */}
          <div className="rounded-3xl border border-white/10 bg-[#111] px-6 py-10 shadow-2xl md:px-16 md:py-16">
            <h1 className="flex items-baseline justify-center gap-2 text-center text-5xl font-black text-white md:text-8xl">
              {totalBalance}{" "}
              <span className="text-2xl font-bold text-gray-600 md:text-5xl">
                sats
              </span>
            </h1>
            <p
              className="mt-6 cursor-pointer break-words text-center font-mono text-sm text-gray-600 transition-colors hover:text-gray-400"
              onClick={handleMintClick}
            >
              {mint}: {walletBalance} sats
            </p>

            {/* Action Buttons Grid */}
            <div className="mt-16 grid grid-cols-2 gap-4 md:grid-cols-4">
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

          {/* Transactions Container */}
          <div className="rounded-3xl border border-white/10 bg-[#111] p-1">
            <Transactions />
          </div>
        </div>
      </div>
    </>
  );
};

export default Wallet;
