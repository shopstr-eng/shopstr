import React, { useState, useEffect } from "react";
import { Button } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "../../components/utility/STATIC-VARIABLES";
import { getLocalStorageData } from "../../components/utility/nostr-helper-functions";
import MintButton from "../../components/wallet/mint-button";
import ReceiveButton from "../../components/wallet/receive-button";
import SendButton from "../../components/wallet/send-button";
import PayButton from "../../components/wallet/pay-button";

const Wallet = () => {
  const [totalBalance, setTotalBalance] = useState(0);

  const { tokens } = getLocalStorageData();

  useEffect(() => {
    const tokensTotal =
      tokens && tokens.length > 0
        ? tokens.reduce((acc, current) => {
            const proofsTotal = current.proofs
              ? current.proofs.reduce((acc, proof) => acc + proof.amount, 0)
              : 0;
            return acc + proofsTotal;
          }, 0)
        : 0;
    setTotalBalance(tokensTotal);
  }, [tokens]);

  return (
    <div className="flex min-h-screen flex-col bg-light-bg pb-20 pt-4 dark:bg-dark-bg sm:ml-[120px] md:ml-[250px]">
      <center>
        <p className="break-words text-center text-6xl text-xl text-light-text dark:text-dark-text">
          {totalBalance} sats
        </p>
      </center>
      <center>
        <ReceiveButton />
        <SendButton />
      </center>
      <center>
        <MintButton />
        <PayButton />
      </center>
    </div>
  );
};

export default Wallet;
