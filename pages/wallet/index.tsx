import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import {
  getLocalStorageData,
  validPassphrase,
} from "../../components/utility/nostr-helper-functions";
import MintButton from "../../components/wallet/mint-button";
import ReceiveButton from "../../components/wallet/receive-button";
import SendButton from "../../components/wallet/send-button";
import PayButton from "../../components/wallet/pay-button";
import Transactions from "../../components/wallet/transactions";
import { CashuMint, Proof } from "@cashu/cashu-ts";
import RequestPassphraseModal from "@/components/utility-components/request-passphrase-modal";

const Wallet = () => {
  const [enterPassphrase, setEnterPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");

  const [totalBalance, setTotalBalance] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [mint, setMint] = useState("");
  const router = useRouter();

  const { signInMethod } = getLocalStorageData();

  useEffect(() => {
    if (signInMethod === "nsec" && !validPassphrase(passphrase)) {
      setEnterPassphrase(true);
    }
  }, [signInMethod, passphrase]);

  useEffect(() => {
    // Function to fetch and update balances
    const fetchAndUpdateBalances = async () => {
      const localData = getLocalStorageData();
      if (localData && localData.tokens) {
        let tokensTotal =
          localData.tokens && localData.tokens.length >= 1
            ? localData.tokens.reduce(
                (acc, token: Proof) => acc + token.amount,
                0,
              )
            : 0;
        setTotalBalance(tokensTotal);
      }
      if (localData && localData.mints && localData.tokens) {
        const currentMint = new CashuMint(localData.mints[0]);
        setMint(localData.mints[0]);
        const mintKeySetResponse = await currentMint.getKeySets();
        const mintKeySetIds = mintKeySetResponse?.keysets;
        const filteredProofs = localData.tokens.filter(
          (p: Proof) => mintKeySetIds?.includes(p.id),
        );
        let walletTotal =
          filteredProofs && filteredProofs.length >= 1
            ? filteredProofs.reduce((acc, p: Proof) => acc + p.amount, 0)
            : 0;
        setWalletBalance(walletTotal);
      }
    };
    // Initial fetch
    fetchAndUpdateBalances();
    // Set up polling with setInterval
    const interval = setInterval(() => {
      fetchAndUpdateBalances();
    }, 1000); // Polling every 1000 milliseconds (1 seconds)
    // Clean up on component unmount
    return () => clearInterval(interval);
  }, []);

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
          <ReceiveButton passphrase={passphrase} />
          <SendButton passphrase={passphrase} />
        </div>
        <div className="flex justify-center">
          <MintButton passphrase={passphrase} />
          <PayButton passphrase={passphrase} />
        </div>
        <div className="flex justify-center">
          <Transactions />
        </div>
      </div>
      <RequestPassphraseModal
        passphrase={passphrase}
        setCorrectPassphrase={setPassphrase}
        isOpen={enterPassphrase}
        setIsOpen={setEnterPassphrase}
        onCancelRouteTo="/wallet"
      />
    </>
  );
};

export default Wallet;
