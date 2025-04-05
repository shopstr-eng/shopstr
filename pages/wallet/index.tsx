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
      <div className="flex min-h-screen flex-col bg-light-bg pt-[8rem] dark:bg-dark-bg">
        <center>
          <p className="mb-2 break-words text-center text-6xl text-light-text dark:text-dark-text">
            {totalBalance} sats
          </p>
        </center>
        <center>
          <p
            className="mb-2 break-words text-center text-sm italic text-gray-500 hover:underline"
            onClick={handleMintClick}
          >
            {mint}: {walletBalance} sats
          </p>
        </center>
        <div className="flex justify-center">
          <ReceiveButton />
          <SendButton />
        </div>
        <div className="flex justify-center">
          <MintButton />
          <PayButton />
        </div>
        <div className="flex justify-center">
          <Transactions />
        </div>
      </div>
    </>
  );
};

export default Wallet;
