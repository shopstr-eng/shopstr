import React, { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import axios from "axios";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  BanknotesIcon,
  BoltIcon,
  CheckIcon,
  ClipboardIcon,
} from "@heroicons/react/24/outline";
import {
  Card,
  CardBody,
  CardHeader,
  Divider,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Image,
  Input,
} from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "../../components/utility/STATIC-VARIABLES";
import { getLocalStorageData } from "../../components/utility/nostr-helper-functions";
import { captureInvoicePaidmetric } from "../../components/utility/metrics-helper-functions";
import MintButton from "../../components/wallet/mint-button";
import ReceiveButton from "../../components/wallet/receive-button"
import { CashuMint, CashuWallet, getEncodedToken } from "@cashu/cashu-ts";

const Wallet = () => {
  const [totalBalance, setTotalBalance] = useState(0);
  
  const { tokens } = getLocalStorageData();

  useEffect(() => {
    const tokensTotal = tokens && tokens.length > 0
      ? tokens.reduce((acc, current) => {
          const proofsTotal = current.proofs ? current.proofs.reduce((acc, proof) => acc + proof.amount, 0) : 0;
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
        <Button
          className={SHOPSTRBUTTONCLASSNAMES + " m-2"}
          startContent={
            <ArrowUpTrayIcon className="h-6 w-6 hover:text-yellow-500" />
          }
        >
          Send
        </Button>
      </center>
      <center>
        <MintButton />
        <Button
          className={SHOPSTRBUTTONCLASSNAMES + " m-2"}
          startContent={<BoltIcon className="h-6 w-6 hover:text-yellow-500" />}
        >
          Redeem
        </Button>
      </center>
    </div>
  );
};

export default Wallet;
