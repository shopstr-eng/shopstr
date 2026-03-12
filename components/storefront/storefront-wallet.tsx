import { useContext, useEffect, useMemo, useState } from "react";
import { StorefrontColorScheme } from "@/utils/types/types";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";
import MintButton from "@/components/wallet/mint-button";
import ReceiveButton from "@/components/wallet/receive-button";
import SendButton from "@/components/wallet/send-button";
import PayButton from "@/components/wallet/pay-button";
import Transactions from "@/components/wallet/transactions";
import { CashuMint, CashuWallet, MintKeyset, Proof } from "@cashu/cashu-ts";
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
          ? tokens.reduce((acc: number, token: Proof) => acc + token.amount, 0)
          : 0;
      setTotalBalance(tokensTotal);
    }
    const walletTotal =
      filteredProofs.length >= 1
        ? filteredProofs.reduce((acc: number, p: Proof) => acc + p.amount, 0)
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
    <div className="flex min-h-screen flex-col px-4 pb-8 pt-8">
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
              className="mb-6 cursor-pointer break-words text-center text-sm transition-colors hover:opacity-80"
              style={{ color: colors.accent }}
              onClick={handleMintClick}
            >
              {mint}: {walletBalance} sats
            </p>
          ) : (
            <p
              className="mb-6 cursor-pointer break-words text-center text-sm transition-colors hover:opacity-80"
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
