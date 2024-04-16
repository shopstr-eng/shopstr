import React, { useState, useEffect } from "react";
import { Button } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "../../components/utility/STATIC-VARIABLES";
import { getLocalStorageData } from "../../components/utility/nostr-helper-functions";
import MintButton from "../../components/wallet/mint-button";
import ReceiveButton from "../../components/wallet/receive-button";
import SendButton from "../../components/wallet/send-button";
import PayButton from "../../components/wallet/pay-button";
import Transactions from "../../components/wallet/transactions";
import { CashuMint, Proof } from "@cashu/cashu-ts";

const Wallet = () => {
  const [totalBalance, setTotalBalance] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [mint, setMint] = useState("");

  const { mints, tokens } = getLocalStorageData();

  useEffect(() => {
    let tokensTotal =
      tokens && tokens.length >= 1
        ? tokens.reduce((acc, token: Proof) => acc + token.amount, 0)
        : 0;
    setTotalBalance(tokensTotal);
  }, [tokens]);

  useEffect(() => {
    const getWalleteBalance = async () => {
      const currentMint = new CashuMint(mints[0]);
      setMint(mints[0]);
      const mintKeySetResponse = await currentMint.getKeySets();
      const mintKeySetIds = mintKeySetResponse?.keysets;
      const filteredProofs = tokens.filter((p: Proof) => mintKeySetIds?.includes(p.id));
      let walletTotal =
        filteredProofs && filteredProofs.length >= 1 ? filteredProofs.reduce((acc, p: Proof) => acc + p.amount, 0) : 0
      setWalletBalance(walletTotal);
    }
    getWalleteBalance();
  }, [mints, tokens]);

  return (
    <div className="flex max-h-screen flex-col bg-light-bg pb-20 pt-6 dark:bg-dark-bg sm:ml-[120px] md:ml-[250px]">
      <center>
        <p className="mb-2 break-words text-center text-6xl text-light-text dark:text-dark-text">
          {totalBalance} sats
        </p>
      </center>
      <center>
        <p className="mb-2 break-words text-center text-sm text-gray-500 italic">
          {mint}: {totalBalance} sats
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
  );
};

export default Wallet;
